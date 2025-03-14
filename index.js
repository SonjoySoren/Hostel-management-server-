const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SEC);

const port = process.env.PORT || 5000;
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
    // await client.connect();

    const mealCollection = client.db("Hostel").collection("Meals");
    const userCollection = client.db("Hostel").collection("users");
    const requestCollection = client.db("Hostel").collection("requests");
    const reviewCollection = client.db("Hostel").collection("reviews");
    const upcomingCollection = client.db("Hostel").collection("upcoming");
    const paymentCollection = client.db("Hostel").collection("payments");

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
      const query = { email: { $regex: new RegExp(email, "i") } };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role == "admin";
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

    // Number of meals added by a admin

    app.get("/mealAdmin", async (req, res) => {
      const adminEmail = req.query?.email;
      const query = {
        distributorEmail: { $regex: new RegExp(adminEmail, "i") },
      };
      const result = await mealCollection.find(query).toArray();

      res.send(result);
    });
    // add meal to  database
    app.post("/meal", async (req, res) => {
      const newMeal = req.body;
      const result = await mealCollection.insertOne(newMeal);
      res.send(result);
    });
    // delete meal
    app.delete("/meal/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await mealCollection.deleteOne(query);
      res.send(result);
    });

    // upcoming foods related apis
    app.get("/upcomingMeals", async (req, res) => {
      const sort = req.query?.sort;
      let sortby = {};
      if (sort) {
        sortby = { likes: parseInt(sort) };
      }
      const result = await upcomingCollection.find().sort(sortby).toArray();
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
    app.post("/upcomingPublish/:id", async (req, res) => {
      const id = req.params?.id;
      const data = req.body;
      let query = {};
      if (id) {
        query = {
          _id: new ObjectId(id),
        };
      }
      const deleteFromUpcoming = await upcomingCollection.deleteOne(query);
      const result = await mealCollection.insertOne(data);
      res.send(result);
    });

    // request food related apis
    app.post("/request", verifyToken, async (req, res) => {
      const data = req.body;
      const result = await requestCollection.insertOne(data);
      res.send(result);
    });
    app.patch("/requestServe/:id", async (req, res) => {
      const id = req.params?.id;
      const query = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          status: "delivered",
        },
      };
      const result = await requestCollection.updateOne(query, updatedDoc);
      res.send(result);
    });

    // request food for admin
    app.get("/requestByAdmin", async (req, res) => {
      const requests = await requestCollection.find({}).toArray();

      const requestsWithUserDetails = await Promise.all(
        requests.map(async (request) => {
          const user = await userCollection.findOne({
            email: { $regex: new RegExp(request.requestedBy, "i") },
          });
          return { ...request, user };
        })
      );

      const requestsWithUserDetailsAndMealData = await Promise.all(
        requestsWithUserDetails.map(async (request) => {
          const meal = await mealCollection.findOne({
            _id: new ObjectId(request.mealId),
          });
          return { ...request, meal };
        })
      );

      res.send(
        requestsWithUserDetailsAndMealData.filter(
          (request) => request?.meal !== null
        )
      );
    });

    // request food for admin with user search
    app.get("/requestByAdminWithSearch", async (req, res) => {
      const searchTerm = req.query?.search;
      const userSearchRegex = new RegExp(searchTerm, "i");
      const userCursor = userCollection.find({
        $or: [
          { username: { $regex: userSearchRegex } },
          { email: { $regex: userSearchRegex } },
        ],
      });

      // Use a cursor to iterate through matching users efficiently
      const users = await userCursor.toArray();

      const requestIds = users.map((user) => user.requestedBy); // Extract requestedBy from users

      // Find requests with matching requestedBy
      const requests = await requestCollection
        .find({ requestedBy: { $in: requestIds } })
        .toArray();

      const requestsWithUserDetails = await Promise.all(
        requests.map(async (request) => {
          const user = users.find((u) => u.email === request.requestedBy); // Find matching user
          return { ...request, user };
        })
      );

      const requestsWithUserDetailsAndMealData = await Promise.all(
        requestsWithUserDetails.map(async (request) => {
          const meal = await mealCollection.findOne({
            _id: new ObjectId(request.mealId),
          });
          return meal ? { ...request, meal } : null;
        })
      );

      // res.send(
      //   requestsWithUserDetailsAndMealData.filter(
      //     (request) => request?.meal !== null
      //   )
      // );
      res.send(requestsWithUserDetailsAndMealData);
    });

    app.get("/reviewIdWithMeal", async (req, res) => {
      // Find distinct mealIds from reviewCollection with corresponding review IDs
      const mealIdsWithReviewIds = await reviewCollection
        .aggregate([
          {
            $group: {
              _id: "$mealId",
              reviewIds: { $push: "$_id" },
            },
          },
        ])
        .toArray();

      // Convert mealIds to ObjectIds
      const objectIdMealIds = mealIdsWithReviewIds.map((item) => ({
        _id: new ObjectId(item._id),
        reviewIds: item.reviewIds,
      }));

      // Find meals using the extracted mealIds
      const meals = await mealCollection
        .find({ _id: { $in: objectIdMealIds.map((item) => item._id) } })
        .toArray();

      // Combine meals with reviewIds
      const mealsWithReviewIds = meals.map((meal) => {
        const matchingMealId = objectIdMealIds.find((item) =>
          item._id.equals(meal._id)
        );
        return {
          ...meal,
          reviewIds: matchingMealId.reviewIds,
        };
      });

      res.send(mealsWithReviewIds);
    });
    // PAYMENT INTENT
    app.post("/createPaymentIntent", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.post("/payments", async (req, res) => {
      const payment = req.body;
      const paymentResult = await paymentCollection.insertOne(payment);

      const query = {
        email: { $regex: new RegExp(payment?.email, "i") }
      };
      const updatedDoc = {
        $set: {
          badge: payment?.plan,
        },
      };
      const result = await userCollection.updateOne(query, updatedDoc);
      res.send({ paymentResult, result });
    });
    app.get("/payments/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const query = { email: { $regex: new RegExp(email, "i") } };
      const result = await paymentCollection.find(query).toArray();
      console.log("from payments email", email, result);
      res.send(result);
    });

    app.get("/request", async (req, res) => {
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
    app.get("/users", async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    // check if user is admin
    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;

      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const query = { email: { $regex: new RegExp(email, "i") } };
      let isAdmin = false;
      const user = await userCollection.findOne(query);
      // console.log("email", email, user);
      if (user?.role == "admin") {
        isAdmin = true;
      }
      res.send({ isAdmin });
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

    app.patch(
      "/users/admin/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            role: "admin",
          },
        };
        const result = await userCollection.updateOne(query, updatedDoc);
        res.send(result);
      }
    );

    // review related apis
    app.get("/review", async (req, res) => {
      const result = await reviewCollection.find().toArray();
      res.send(result);
    });

    app.get("/review/mealData", async (req, res) => {
      const email = req.query?.email;
      let query = {};
      if (email) {
        query = {
          userEmail: { $regex: new RegExp(email, "i") },
        };
      }
      const userReview = await reviewCollection.find(query).toArray();
      const mealReview = userReview.map((review) => ({
        mealId: review.mealId,
        reviewText: review.reviewText,
      }));
      const mealIds = userReview.map((review) => review.mealId);
      const objectIdMealIds = mealIds.map((id) => new ObjectId(id));
      const meals = await mealCollection
        .find({ _id: { $in: objectIdMealIds } })
        .toArray();

      const mealsWithReview = meals.map((meal) => {
        const matchingReview = mealReview.find(
          (review) => review.mealId === meal._id.toString()
        );
        return { ...meal, reviewText: matchingReview.reviewText };
      });
      res.send(mealsWithReview);
    });

    app.post("/review", async (req, res) => {
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
    app.get("/reviewByEmail", async (req, res) => {
      // console.log("hi from review byEmail")
      const email = req.query?.email;
      const mealId = req.query?.mealId;
      let query = {};
      if (email && mealId) {
        query = {
          mealId: mealId,
          userEmail: { $regex: new RegExp(email, "i") },
        };
      }
      const result = await reviewCollection.findOne(query);
      res.send(result);
    });

    app.patch("/review", verifyToken, async (req, res) => {
      const email = req.query?.email;
      const mealId = req.query?.mealId;
      const newReview = req.body;
      // console.log("from patch", email, mealId, newReview);
      let query = {};
      if (email && mealId && newReview) {
        query = {
          mealId: mealId,
          userEmail: { $regex: new RegExp(email, "i") },
          reviewText: { $regex: new RegExp(newReview?.oldReviewText, "i") },
        };
      }
      const updatedDoc = {
        $set: {
          reviewText: newReview?.reviewText,
        },
      };

      const result = await reviewCollection.updateOne(query, updatedDoc);

      res.send(result);
    });

    app.delete("/review", async (req, res) => {
      const email = req.query?.email;
      const mealId = req.query?.mealId;
      if (email && mealId) {
        query = {
          mealId: mealId,
          userEmail: { $regex: new RegExp(email, "i") },
        };
      }
      const deleteResult = await reviewCollection.deleteMany(query);
      res.send(deleteResult);
    });
    // tests
    app.get("/test", async (req, res) => {
      res.send({ message: "test successful" });
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
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
