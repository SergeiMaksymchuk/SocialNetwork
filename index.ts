import express from "express";
import ejs from "ejs";
import { MongoClient, ObjectId } from "mongodb";
import session from 'express-session';
import connectMongo from 'connect-mongo';
import 'dotenv/config'
import { exit } from "process";

declare module 'express-session' {
  export interface SessionData {
    userId: string
  }
}
const mongodbUsername = process.env.URI_USERNAME;
const mongodbPassword = process.env.URI_PASSWORD;
const mongodbCluster = process.env.URI_CLUSTER;
const uri =
  `mongodb+srv://${mongodbUsername}:${mongodbPassword}${mongodbCluster}`;
const client = new MongoClient(uri);
const app = express();

const applicationPort = process.env.APPLICATION_PORT
app.set("view engine", "ejs");
app.set("port", applicationPort);
app.use(express.static("css"));
app.use(express.static("assets"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: "1mb" }));
const sessionSecret = process.env.SESSION_SECRET
if (!sessionSecret) {
  exit(1);
}
app.use(session({
  secret: sessionSecret,
  resave: false, 
  saveUninitialized: false, 
  cookie: { secure: false, maxAge: 900000, httpOnly: true }
}));

interface Profile {
  _id?: ObjectId;
  id: string;
  name: string;
  email: string;
  description: string;
  friends?: Friendships[];
  picture: string;
  password:string;
}

interface Friendships {
  id: number;
}
interface Message {
  _id?: ObjectId;
  username: string;
  contents: string;
}

let profiles: Profile[] = [];
let friendships: Friendships[] = [];

const generateRandomPassword = ():string => {
  let randomNumber:string = Math.floor(Math.random()*1000000000000).toString();
  if (randomNumber.length >= 8) {
    return randomNumber;
  }
  else{
    return "Geen geldig wachtwoord."
  }
}

app.get("/", (req, res) => {
  if (req.session.userId) {
    res.render("home", {userId: req.session.userId});
  }
  else{
    res.render("login");
  }
});

app.post("/login", async (req, res) => {
  const { name, password } = req.body;
  const user = profiles.find((profile) => profile.name === name);

  if (user && user.password === password) {
    req.session.userId = user.id.toString();
    req.session.save(() => res.redirect("/"));
  } else {
    res.render("login");
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => {
      res.redirect("/");
  });
});

app.get("/profiles", (req, res) => {
  res.render("profiles", { profiles, friendships, userId: req.session.userId });
});

app.post("/addFriend/:id", async (req, res) => {
  const friendId = parseInt(req.params.id);
  await client.db("Social_Network").collection("Profiles").updateOne(
    { id: req.session.userId },
    { $push: { friends: { id: friendId } } }
  );
  if (friendships.find((friendship) => friendship.id === friendId)) {
    res.sendStatus(404)
  } else {
    friendships.push({ id: friendId });
  }
  res.redirect("/profiles");
});

app.get('/myprofile', (req, res) => {
  const profile = profiles.find((profile) => profile.id === req.session.userId);
  if (profile) {
    res.render('myprofile', { profile });
  } else {
    res.sendStatus(404);
  }
});

app.post('/saveProfile', (req, res) => {
  const { picture, description } = req.body;
  const index = profiles.findIndex((profile) => profile.id === req.session.userId);
  if (index !== -1) {
    profiles[index].picture = picture;
    profiles[index].description = description;
    res.redirect('/myprofile');
  }
  else{
    res.sendStatus(404);
  }
});

app.get("/timeline", async (req, res) => {
  const profile = profiles.find((profile) => profile.id === req.session.userId);
  const messages = await client.db("Social_Network").collection("Messages").find().toArray();
  res.render("timeline", { profile, messages });
});

app.post("/postMessage", async (req, res) => {
  const { contents } = req.body;
  const findProfile = profiles.find((profile) => profile.id === req.session.userId);
  if (findProfile) {
    const newMessage: Message = {
      username: findProfile.name,
      contents,
    };
    await client.db("Social_Network").collection("Messages").insertOne(newMessage);
    res.redirect("/timeline");
  } else {
    res.sendStatus(404)
  }
});

app.listen(app.get("port"), async () => {
  await client.connect();
  const database = await client.db("Social_Network").collection("Profiles");
  profiles = await database.find<Profile>({}).toArray();
  
  if (profiles.length === 0) {
    database.deleteMany({});
    const data = await (
      await fetch(
        "https://randomuser.me/api/?inc=name,email,picture&nat=us&results=20"
      )
    ).json();
    const profilesData = data.results;
    const profileUrl: string[] = [];
    let nextId: string = "0";
    const profilesToAdd: Profile[] = profilesData
      .map((profileData: any) => {
        const { name, email, picture } = profileData;
        const fullName: string = `${name.first} ${name.last}`;
        const pictureUrl: string = picture.large;

        if (profileUrl.includes(pictureUrl)) {
          return null;
        }
        profileUrl.push(pictureUrl);
        const newProfile: Profile = {
          id: nextId,
          name: fullName,
          email: email,
          description: "",
          friends: [],
          picture: pictureUrl,
          password:generateRandomPassword(),
        };
        nextId = (parseInt(nextId) + 1).toString();
        return newProfile;
      }).filter((profile: Profile | null) => profile !== null);
    await client
      .db("Social_Network")
      .collection("Profiles")
      .insertMany(profilesToAdd);
  }
  console.log(`Local url: http://localhost:${app.get("port")}`);
});
export {};
