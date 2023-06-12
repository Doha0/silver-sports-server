const express = require('express');
const app = express();
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());


const verifyJWT = (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization) {
        return res.status(401).send({ error: true, message: 'unauthorized access' });
    }

    const token = authorization.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).send({ error: true, message: 'unauthorized access' })
        }
        req.decoded = decoded;
        next();
    })
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.2mmen1j.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        client.connect();

        const usersCollection = client.db("SilverDB").collection("users");
        const studentsCollection = client.db("SilverDB").collection("students");
        const classCollection = client.db("SilverDB").collection("class");
        const InstructorsCollection = client.db("SilverDB").collection("instructors");
        const paymentCollection = client.db("SilverDB").collection("payments");


        app.post('/jwt', (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })

            res.send({ token })
        })


        // ---------------------------User-----------------------
        app.get('/users', verifyJWT, async (req, res) => {
            const result = await usersCollection.find().toArray();
            res.send(result);
        });

        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email }
            const existingUser = await usersCollection.findOne(query);

            if (existingUser) {
                return res.send({ message: 'user already exists' })
            }

            const result = await usersCollection.insertOne(user);
            res.send(result);
        });

        app.patch("/users/role", async (req, res) => {
            const email = req.query?.email;
            const role = req.query?.role;
            const filter = { email: email };
            const updateDoc = {
                $set: {
                    role: role,
                },
            };
            const result = await usersCollection.updateOne(filter, updateDoc);
            res.send(result);
        });

        // ------------- roles-------------------
        app.get("/users/admin/:email", verifyJWT, async (req, res) => {
            const email = req.params.email;
            if (req.decoded.email !== email) {
                res.send({ admin: false });
            }
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            const result = { admin: user?.role === "admin" };
            res.send(result);
        });

        app.get("/users/instructor/:email", verifyJWT, async (req, res) => {
            const email = req.params.email;
            if (req.decoded.email !== email) {
                res.send({ instructor: false });
            }
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            const result = { instructor: user?.role === "instructor" };
            res.send(result);
        });

        app.get("/users/student/:email", verifyJWT, async (req, res) => {
            const email = req.params.email;
            if (req.decoded.email !== email) {
                res.send({ instructor: false });
            }
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            const result = { instructor: user?.role === "student" };
            res.send(result);
        });

        // ---------------------------payment-----------------------
        app.get("/payment/:id", async (req, res) => {
            const id = req.params.id;
            const query = {
                _id: new ObjectId(id)
            };
            const result = await studentsCollection.findOne(query);
            res.send(result);
        });

        app.post('/create-payment-intent', verifyJWT, async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100);
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });

            res.send({
                clientSecret: paymentIntent.client_secret
            })
        })


        // payment related api
        app.post("/payments", verifyJWT, async (req, res) => {
            const payment = req.body;
            const insertResult = await paymentCollection.insertOne(payment);
            const query = { _id: new ObjectId(payment.courseId) };
            const updatedDoc = {
                $set: {
                    $inc: { availableSeats: -1 },
                }
            }
            const seatsResult = await classCollection.updateOne(query, updatedDoc);
            console.log(seatsResult);
            const deleteResult = await studentsCollection.deleteOne(query);

            res.send({ insertResult, seatsResult, deleteResult });
        });




        // ----------------------Enroll-------------------
        app.get('/enroll', async (req, res) => {
            const email = req.query.email;

            if (!email) {
                res.send([]);
            }

            const query = { email: email };
            const result = await paymentCollection.find(query).toArray();
            res.send(result);
        });

        // ----------------------Payment History-------------------
        app.get('/history', async (req, res) => {
            const email = req.query.email;
            if (!email) {
                res.send([]);
            }
            const query = { email: email };
            const result = await paymentCollection.find(query).sort({ date: -1 }).toArray();
            res.send(result);
        });


        // ----------------------students collection----------------
        app.get('/students', async (req, res) => {
            const email = req.query.email;

            if (!email) {
                res.send([]);
            }

            const query = { email: email };
            const result = await studentsCollection.find(query).toArray();
            res.send(result);
        });

        app.post('/students', async (req, res) => {
            const classes = req.body;
            const result = await studentsCollection.insertOne(classes);
            res.send(result);
        });

        app.delete('/students/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await studentsCollection.deleteOne(query);
            res.send(result);
        });


        // ---------------------Instructors collection-----------------
        app.get('/instructors', async (req, res) => {
            const result = await InstructorsCollection.find().toArray();
            res.send(result);
        });

        app.get('/popularinstructors', async (req, res) => {
            const result = await InstructorsCollection.find().limit(6).toArray();
            res.send(result);
        });

        // -----------------Class collection--------------------
        app.get("/class", async (req, res) => {
            const approvedClasses = req.query?.approve;
            const limit = req.query?.limit;
            const filter = { status: "approve" };

            if (approvedClasses) {
                const result = await classCollection.find(filter).toArray();
                res.send(result);
                return;
            }

            if (limit) {
                const result = await classCollection.find(filter).limit(parseInt(limit)).toArray();
                res.send(result);
                return
            }

            const result = await classCollection.find().toArray();
            res.send(result);
        });

        app.post('/class', async (req, res) => {
            const classes = req.body;
            const result = await classCollection.insertOne(classes);
            res.send(result);
        });

        app.get('/course', async (req, res) => {
            const email = req.query.email;

            const query = { instructor_email: email }
            // console.log(query);
            const result = await classCollection.find(query).toArray();
            res.send(result);
        });


        app.patch("/class/:id", async (req, res) => {
            const id = req.params.id;
            const status = req.query?.status;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    status: status,
                },
            };
            const result = await classCollection.updateOne(filter, updateDoc);
            res.send(result);
        });

        app.get('/feedback/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await classCollection.findOne(query);
            res.send(result);
        });

        app.put("/feedback/:id", async (req, res) => {
            const id = req.params.id;
            const { feedback } = req.body;
            const filter = { _id: new ObjectId(id) };
            const options = { upsert: true };
            const updateDoc = {
                $set: {
                    feedback,
                },
            };
            const result = await classCollection.updateOne(
                filter,
                updateDoc,
                options
            );
            res.send(result);
        });



        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);












app.get('/', (req, res) => {
    res.send('Silver Sport is running')
})

app.listen(port, () => {
    console.log(`Silver Sport is running on port ${port}`);
})