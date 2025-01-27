const express = require("express");
const app = express();
const cors = require("cors");
const port = process.env.PORT || 5000;
require("dotenv").config();
var jwt = require("jsonwebtoken");

// middleware
app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_Name}:${process.env.DB_Pass}@cluster0.fb2uu.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const mealCollection = client.db("Hostel").collection("Meals");
    const userCollection = client.db("Hostel").collection("users");
    const requestCollection = client.db("Hostel").collection("requests");
    const reviewCollection = client.db("Hostel").collection("reviews");
    const upcomingCollection = client.db("Hostel").collection("upcoming");

    // Apis related to jwt
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    // verify token
    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      const token = req.headers.authorization.split(" ")[1];

      jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
        if (err) {
          return res.status(401).send({ message: "unauthorized access" });
        }
        req.decoded = decoded;
        next();
      });
    };

    // verify admin
    const verifyAdmin = async (req, res, next) => {
      const email = req?.decoded?.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };
    // Meal related api

    app.get("/meal", async (req, res) => {
      const search = req.query?.search;
      const category = req.query?.category;
      const min = req.query?.min;
      const max = req.query?.max;
      const minPrice = parseFloat(min);
      const maxPrice = parseFloat(max);
      let query = {};

      if (search) {
        query = {
          $or: [
            { title: { $regex: search, $options: "i" } },
            { description: { $regex: search, $options: "i" } },
            { ingredients: { $in: [search] } },
          ],
        };
      }
      if (category) {
        query.category = { $regex: new RegExp(category, "i") };
      }
      if (minPrice || maxPrice) {
        query.price = { $gte: minPrice, $lte: maxPrice };
      }
      const cursor = mealCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });
    // Meal with id
    app.get("/meal/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await mealCollection.findOne(query);
      res.send(result);
    });
    // Liked functionality for meals
    app.put("/meal/updateLikes/:id", verifyToken, async (req, res) => {
      const userEmail = req.body.email;

      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const item = await mealCollection.findOne(query);

      if (!item?.likedBy?.includes(userEmail)) {
        const result = await mealCollection.updateOne(
          query,
          {
            $inc: { likes: 1 },
            $push: { likedBy: userEmail },
          },
          { upsert: true }
        );

        res.send(result);
      } else {
        const result = await mealCollection.updateOne(
          query,
          {
            $inc: { likes: -1 },
            $pull: { likedBy: userEmail },
          },
          { upsert: true }
        );

        res.send(result);
      }
    });
    // upcoming foods related apis
    app.get("/upcomingMeals", async (req, res) => {
      const result = await upcomingCollection.find().toArray();
      res.send(result);
    });
    // upcoming foods by id
    app.get("/upcomingMealById/:id", async (req, res) => {
      const id = req.params?.id;
      if (id == "undefined") {
        return res.send({ message: "params is not defined" });
      }
      let query = {};
      if (id) {
        query = { _id: new ObjectId(id) };
      }

      const result = await upcomingCollection.findOne(query);
      res.send(result);
    });

    // Liked functionality for upcomingMeals
    app.put("/upcomingMeal/updateLikes/:id", async (req, res) => {
      const userEmail = req.body.email;

      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const item = await upcomingCollection.findOne(query);

      if (!item?.likedBy?.includes(userEmail)) {
        const result = await upcomingCollection.updateOne(
          query,
          {
            $inc: { likes: 1 },
            $push: { likedBy: userEmail },
          },
          { upsert: true }
        );

        res.send(result);
      } else {
        const result = await upcomingCollection.updateOne(
          query,
          {
            $inc: { likes: -1 },
            $pull: { likedBy: userEmail },
          },
          { upsert: true }
        );

        res.send(result);
      }
    });

    // request food related apis
    app.post("/request", verifyToken, async (req, res) => {
      const data = req.body;
      const result = await requestCollection.insertOne(data);
      res.send(result);
    });
    app.get("/request", verifyToken, async (req, res) => {
      const email = req.query?.email;
      // console.log(email);
      let query = {};
      if (email) {
        query = { requestedBy: { $regex: new RegExp(email, "i") } };
      }
      const userRequests = await requestCollection.find(query).toArray();
      const mealRequests = userRequests.map((request) => ({
        mealId: request.mealId,
        status: request.status,
      }));
      const mealIds = userRequests.map((request) => request.mealId);
      const objectIdMealIds = mealIds.map((id) => new ObjectId(id));
      const meals = await mealCollection
        .find({ _id: { $in: objectIdMealIds } })
        .toArray();
      const mealsWithStatus = meals.map((meal) => {
        const matchingRequest = mealRequests.find(
          (request) => request.mealId === meal._id.toString()
        );
        return { ...meal, status: matchingRequest.status };
      });

      res.send(mealsWithStatus);
    });
    // delete request by mealId and requestedBy
    app.delete("/request", async (req, res) => {
      const userEmail = req.query?.userEmail;
      const mealId = req.query?.mealId;
      let query = {};
      if (userEmail && mealId) {
        query = {
          mealId: mealId,
          requestedBy: { $regex: new RegExp(userEmail, "i") },
        };
      }
      const result = await requestCollection.deleteMany(query);
      res.send(result);
    });

    // User Related apis
    app.get("/users/:email", verifyToken, async (req, res) => {
      const email = req.params?.email;

      const query = { email: { $regex: new RegExp(email, "i") } };

      const result = await userCollection.findOne(query);
      // console.log("inside user api");
      res.send(result);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exists", insertedId: null });
      }
      const result = await userCollection.insertOne(user);
      res.send({ result });
    });
    // review related apis
    app.get("/review", async (req, res) => {
      const email = req.query?.email;
      const query = {};
      if (email) {
        query = {
          userEmail:  { $regex: new RegExp(email, 'i') } }
      }
      const result = await reviewCollection.find(query).toArray();
      res.send(result);
    });
    app.post("/review", verifyToken, async (req, res) => {
      const review = req.body;
      const result = await reviewCollection.insertOne(review);
      res.send(result);
    });
    // get review by ID
    app.get("/review/:id", async (req, res) => {
      const id = req.params.id;
      const query = { mealId: id };
      const result = await reviewCollection.find(query).toArray();
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", async (req, res) => {
  res.send("Hostel Server in running");
});
app.listen(port, () => {
  console.log(`This server is running on port: ${port}`);
});
