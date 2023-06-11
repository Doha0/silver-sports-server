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
        // await client.connect();

        const studentsCollection = client.db("SilverDB").collection("students");
        const classCollection = client.db("SilverDB").collection("class");
        const InstructorsCollection = client.db("SilverDB").collection("instructors");
        const paymentCollection = client.db("SilverDB").collection("payments");


        app.post('/jwt', (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })

            res.send({ token })
        })

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
            const deleteResult = await studentsCollection.deleteOne(query);

            res.send({ insertResult, deleteResult });
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

        // -----------------Class collection--------------------
        app.get('/class', async (req, res) => {
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