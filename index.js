require("dotenv").config();
var jwt = require("jsonwebtoken");
const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 5000;

app.use(
  cors({
    origin: ["http://localhost:5173", "https://sd-buildbox.web.app"],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
};

const verifyToken = (req, res, next) => {
  console.log("inside verify token: ", req.headers);
  const token = req.headers.authorization;

  if (!token) {
    return res.status(401).send({ message: "Unauthorized: Token not found" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).send({ message: "Unauthorized: Invalid token" });
    }
    req.user = decoded;
    next();
  });
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_KEY}@cluster0.pb8np.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // await client.connect();
    const db = client.db("SdBuildBox");
    const apartmentCollection = db.collection("apartments");
    const announcementCollection = db.collection("announcements");
    const paymentHistoryCollection = db.collection("paymentHistories");
    const agreementCollection = db.collection("agreements");
    const couponCollection = db.collection("coupons");
    const userCollection = db.collection("users");
    app.post("/jwt", async (req, res) => {
      try {
        const user = req.body;
        const token = jwt.sign(user, process.env.JWT_SECRET, {
          expiresIn: "365d",
        });
        res.cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        });
        res.send({ token: token, success: true });
      } catch (error) {
        console.error("Error generating JWT:", error);
        res.status(500).json({ error: "Failed to generate JWT" });
      }
    });

    app.post("/logout", (req, res) => {
      res.clearCookie("token", {
        httpOnly: true,
        secure: false,
      });
      res.status(200).send({
        success: true,
      });
    });

    app.put("/usersToMember", async (req, res) => {
      try {
        const { email, role, agreementAcceptedDate } = req.body;

        if (!email || !role) {
          return res
            .status(400)
            .send({ message: "Email and role are required." });
        }

        const existingUser = await userCollection.findOne({ email });

        if (existingUser) {
          const updateResult = await userCollection.updateOne(
            { email },
            {
              $set: {
                role,
                agreementAcceptedDate: agreementAcceptedDate || new Date(),
              },
            }
          );
          return res.status(200).send({
            message: `User role updated successfully to "${role}".`,
            result: updateResult,
          });
        }
        return res.status(404).send({ message: "User not found." });
      } catch (error) {
        console.error("Error handling user:", error);
        res.status(500).send({ message: "Internal server error", error });
      }
    });

    app.post("/usersLogin", async (req, res) => {
      try {
        const user = req.body;
        const existingUser = await userCollection.findOne({
          email: user.email,
        });

        if (!existingUser) {
          const result = await userCollection.insertOne(user);
          return res
            .status(201)
            .send({ message: "User added successfully", result });
        }

        res.status(200).send({ message: "User already exists" });
      } catch (error) {
        console.error("Error adding user:", error);
        res.status(500).send({ message: "Internal server error", error });
      }
    });

    app.post("/users", async (req, res) => {
      try {
        const user = req.body;
        const existingUser = await userCollection.findOne({
          email: user.email,
        });
        if (existingUser) {
          return res
            .status(400)
            .send({ message: "User with this email already exists." });
        }
        const result = await userCollection.insertOne(user);
        res.status(201).send(result);
      } catch (error) {
        console.error("Error adding user:", error);
        res.status(500).send({ message: "Internal server error", error });
      }
    });

    app.get("/users", async (req, res) => {
      try {
        const cursor = userCollection.find();
        const result = await cursor.toArray();
        res.send(result);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch userCollection" });
      }
    });
    app.put("/users", async (req, res) => {
      try {
        const user = req.body;
        const existingUser = await userCollection.findOne({
          email: user.email,
        });

        if (existingUser) {
          return res.status(200).send({
            message: "User already exists. No changes were made.",
            result: existingUser,
          });
        }

        const newUser = {
          email: user.email,
          role: "user",
        };
        const insertResult = await userCollection.insertOne(newUser);
        res.status(201).send({
          message: "User added successfully.",
          result: insertResult,
        });
      } catch (error) {
        console.error("Error handling user:", error);
        res.status(500).send({ message: "Internal server error", error });
      }
    });

    app.get("/user/:email", async (req, res) => {
      const { email } = req.params;
      try {
        const user = await userCollection.findOne({ email });
        if (!user) {
          return res.status(404).send({ message: "User not found" });
        }
        res.send(user);
      } catch (error) {
        console.error("Error fetching user:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });
    app.delete("/users/:id", async (req, res) => {
      const { id } = req.params;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.json(result);
    });

    app.put("/updateUsers/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const options = { upsert: true };
        const filter = { _id: new ObjectId(id) };
        const updatedUser = req.body;

        if (updatedUser.role) {
          const roleUpdate = {
            $set: {
              role: updatedUser.role,
              updatedAt: new Date(),
            },
          };

          const result = await userCollection.updateOne(
            filter,
            roleUpdate,
            options
          );
          res.send(result);
        } else {
          res.status(400).send({ error: "Role field is required" });
        }
      } catch (error) {
        console.error("Error updating user:", error);
        res.status(500).send({ error: "Failed to update user" });
      }
    });

    app.post("/coupons", async (req, res) => {
      try {
        const coupon = req.body;
        const result = await couponCollection.insertOne(coupon);
        res.send(result);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch coupon details" });
      }
    });

    app.get("/coupons", async (req, res) => {
      const cursor = couponCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/myCoupons/:email", async (req, res) => {
      const email = req.params.email;
      const query = { owner_email: email };
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }

      if (req.user.email !== email) {
        return res.status(403).json({ error: "Forbidden access" });
      }

      try {
        const coupon = await couponCollection
          .find({ userEmail: email })
          .toArray();
        res.json(coupon);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch coupon" });
      }
    });

    app.put("/updateCoupon/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const options = { upsert: true };
        const filter = { _id: new ObjectId(id) };
        const updatedCoupon = req.body;

        const couponUpdate = {
          $set: {
            couponCode: updatedCoupon.couponCode,
            discountPercentage: updatedCoupon.discountPercentage,
            couponDescription: updatedCoupon.couponDescription,
            updatedAt: new Date(),
          },
        };

        const result = await couponCollection.updateOne(
          filter,
          couponUpdate,
          options
        );

        res.send(result);
      } catch (error) {
        console.error("Error updating coupon:", error);
        res.status(500).send({ error: "Failed to update coupon" });
      }
    });

    app.get("/coupon/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await couponCollection.findOne(query);
        res.send(result);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch reviews" });
      }
    });

    app.delete("/coupon/:id", async (req, res) => {
      const { id } = req.params;
      const query = { _id: new ObjectId(id) };
      const result = await couponCollection.deleteOne(query);
      res.json(result);
    });

    app.post("/apartments", async (req, res) => {
      try {
        const apartment = req.body;
        const result = await apartmentCollection.insertOne(apartment);
        res.send(result);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch apartment details" });
      }
    });

    app.get("/apartments", async (req, res) => {
      const cursor = apartmentCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/apartments/:_id", async (req, res) => {
      const { _id } = req.params;
      try {
        const user = await apartmentCollection.findOne({
          _id: new ObjectId(_id),
        });

        if (!user) {
          return res.status(404).send({ message: "apartment not found." });
        }

        res.send(user);
      } catch (error) {
        console.error("Error fetching apartment:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    app.put("/updateApartment/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const options = { upsert: true };
        const updatedApartment = req.body;

        const updateDoc = {
          $set: {
            bookingStatus: updatedApartment.bookingStatus,
            updatedAt: new Date(),
          },
        };

        const result = await apartmentCollection.updateOne(
          filter,
          updateDoc,
          options
        );

        if (result.modifiedCount > 0 || result.upsertedCount > 0) {
          res.send({
            success: true,
            message: "Apartment updated successfully",
          });
        } else {
          res
            .status(400)
            .send({ success: false, message: "Failed to update Apartment" });
        }
      } catch (error) {
        console.error("Error updating Apartment:", error);
        res
          .status(500)
          .send({ success: false, error: "Internal Server Error" });
      }
    });

    app.post("/announcements", async (req, res) => {
      try {
        const announcement = req.body;
        if (!announcement.title || !announcement.description) {
          return res.status(400).send({
            success: false,
            message: "Title and description are required.",
          });
        }
        const currentDate = new Date();
        announcement.date = currentDate.toISOString();

        const result = await announcementCollection.insertOne(announcement);
        res.status(201).send({
          success: true,
          acknowledged: result.acknowledged,
          insertedId: result.insertedId,
        });
      } catch (error) {
        console.error("Error adding announcement:", error);
        res.status(500).send({
          success: false,
          message: "Internal server error",
          error: error.message,
        });
      }
    });

    app.get("/announcements", async (req, res) => {
      try {
        const cursor = announcementCollection.find();
        const result = await cursor.toArray();
        res.send(result);
      } catch (error) {
        res
          .status(500)
          .json({ error: "Failed to fetch  announcementCollection" });
      }
    });

    app.post("/paymentHistory", async (req, res) => {
      try {
        const payment = req.body;
        payment.date = new Date();
        const result = await paymentHistoryCollection.insertOne(payment);
        res.status(201).send({
          success: true,
          acknowledged: result.acknowledged,
          insertedId: result.insertedId,
        });
      } catch (error) {
        console.error("Error saving payment:", error);
        res.status(500).send({
          success: false,
          message: "Internal server error",
          error: error.message,
        });
      }
    });

    app.get("/paymentHistory", async (req, res) => {
      try {
        const cursor = paymentHistoryCollection.find();
        const result = await cursor.toArray();
        res.send(result);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch payment history data" });
      }
    });

    app.post("/agreements", async (req, res) => {
      try {
        const agreements = req.body;
        const result = await agreementCollection.insertOne(agreements);
        res.status(201).send({
          success: true,
          acknowledged: result.acknowledged,
          insertedId: result.insertedId,
        });
      } catch (error) {
        console.error("Error adding agreements:", error);
        res.status(500).send({
          success: false,
          message: "Internal server error",
          error: error.message,
        });
      }
    });

    app.get("/agreements", async (req, res) => {
      try {
        const cursor = agreementCollection.find();
        const result = await cursor.toArray();
        res.send(result);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch  agreementCollection" });
      }
    });

    app.get("/myAgreements/:email", async (req, res) => {
      try {
        const agreements = await agreementCollection
          .find({ user_email: req.params.email })
          .toArray();
        res.status(200).json(agreements);
      } catch (error) {
        console.error("Error fetching agreements:", error);
        res.status(500).json({ error: "Failed to fetch agreements" });
      }
    });

    app.get("/agreements/:_id", async (req, res) => {
      const { _id } = req.params;
      try {
        const user = await agreementCollection.findOne({
          _id: new ObjectId(_id),
        });

        if (!user) {
          return res.status(404).send({ message: "Agreement not found." });
        }

        res.send(user);
      } catch (error) {
        console.error("Error fetching agreement:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    app.put("/updateAgreement/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const options = { upsert: true };

        const updatedAgreement = req.body;

        const updateDoc = {
          $set: {
            status: updatedAgreement.status,
            billStatus: updatedAgreement.billStatus,
            updatedAt: new Date(),
          },
        };

        const result = await agreementCollection.updateOne(
          filter,
          updateDoc,
          options
        );

        if (result.modifiedCount > 0 || result.upsertedCount > 0) {
          res.send({
            success: true,
            message: "Agreement updated successfully",
          });
        } else {
          res
            .status(400)
            .send({ success: false, message: "Failed to update agreement" });
        }
      } catch (error) {
        console.error("Error updating agreement:", error);
        res
          .status(500)
          .send({ success: false, error: "Internal Server Error" });
      }
    });
    console.log("Connected to MongoDB successfully!");
  } catch (err) {
    console.error(err);
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("sd buildBox server is running");
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
