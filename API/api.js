require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = 3000;

const mongodbUsername = process.env.MongoDb_Username;
const mongodbPassword = process.env.MongoDb_Password;

console.log(process.env.MongoDb_Username);
// mongoose.connect(
//   `mongodb+srv://${mongodbUsername}:${mongodbPassword}@todo1.mxkldpe.mongodb.net/todosAppDb`
// );
// const db = mongoose.connection;
// // errors  may occur during the connection to the MongoDB database
// db.on("error", console.error.bind(console, "MongoDB connection error:"));

// mongodb+srv://balajikosuri:<password>@todo1.mxkldpe.mongodb.net/?retryWrites=true&w=majority
function connectToMongoDB() {
  try {
    mongoose.connect(
      `mongodb+srv://${mongodbUsername}:${mongodbPassword}@todo1.mxkldpe.mongodb.net/todosAppDb`
    );

    const db = mongoose.connection;

    db.on("error", (error) => {
      console.error("MongoDB connection error:", error);
    });

    db.once("open", () => {
      console.log("Connected to MongoDB");
    });
  } catch (error) {
    console.log(error);
  }
}

// Call the function to connect to MongoDB
connectToMongoDB();

const todoSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
    due_date: {
      type: Date,
    },
    priority: {
      type: String,
      enum: ["high", "medium", "low"],
    },
    completed: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

const Todo = mongoose.model("Todo", todoSchema);

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    unique: true,
    required: true,
  },
  password: {
    type: String,
    required: true,
  },
});

// Hash the password before saving
userSchema.pre("save", async function (next) {
  const user = this;
  if (!user.isModified("password")) return next();

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(user.password, salt);
  user.password = hashedPassword;
  next();
});

const User = mongoose.model("User", userSchema);

app.use(express.json());

// Middleware to verify JWT
function authenticateToken(req, res, next) {
  const authHead = req.header("Authorization");
  const token = authHead.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  jwt.verify(token, "your_secret_key", (err, user) => {
    if (err) {
      return res.status(403).json({ error_message: err.message });
    }

    req.user = user;
    next();
  });
}

// Signup - Create User
app.post("/signup", async (req, res) => {
  try {
    const { username, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(409).json({ message: "Username already exists" });
    }

    const newUser = new User({ username, password });
    const savedUser = await newUser.save();
    res.status(201).json(savedUser);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Login - Generate JWT
app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    // Check if user exists
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    // Check if password is correct
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    // Generate JWT
    const payload = { userId: user._id };
    const your_secret_key = "your_secret_key";
    const token = jwt.sign(payload, your_secret_key, {
      expiresIn: "1h",
    });

    res.status(200).json({ jwt_token: token });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// CREATE - POST a Todo
app.post("/todos", authenticateToken, async (req, res) => {
  try {
    const { title, description, due_date, priority } = req.body;
    const createdBy = req.user.userId;

    const newTodo = new Todo({
      title,
      description,
      due_date,
      priority,
      createdBy,
    });
    const savedTodo = await newTodo.save();
    res.status(201).json(savedTodo);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// get All Users
app.get("/users", async (req, res) => {
  try {
    const users = await User.find();
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// READ - GET all Todos for the authenticated user
app.get("/todos", authenticateToken, async (req, res) => {
  try {
    const createdBy = req.user.userId;
    const todos = await Todo.find({ createdBy });
    res.status(200).json(todos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// READ - GET a specific Todo by ID for the authenticated user
app.get("/todos/:id", authenticateToken, async (req, res) => {
  try {
    const createdBy = req.user.userId;
    const todo = await Todo.findOne({ _id: req.params.id, createdBy });
    if (!todo) {
      return res.status(404).json({ message: "Todo not found" });
    }
    res.status(200).json(todo);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// UPDATE - PUT a Todo for the authenticated user
app.put("/todos/:id", authenticateToken, async (req, res) => {
  try {
    const createdBy = req.user.userId;
    const updatedTodo = await Todo.findOneAndUpdate(
      { _id: req.params.id, createdBy },
      req.body,
      { new: true }
    );

    if (!updatedTodo) {
      return res.status(404).json({ message: "Todo not found" });
    }

    res.status(200).json(updatedTodo);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE a Todo for the authenticated user
app.delete("/todos/:id", authenticateToken, async (req, res) => {
  try {
    const createdBy = req.user.userId;
    const deletedTodo = await Todo.findOneAndDelete({
      _id: req.params.id,
      createdBy,
    });

    if (!deletedTodo) {
      return res.status(404).json({ message: "Todo not found" });
    }

    res.status(200).json({ message: "Todo deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
