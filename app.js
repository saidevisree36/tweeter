const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;
const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("server running at http://localhost:3000");
    });
  } catch (e) {
    console.log(`Db Error:${e.message}`);
    process.exit(1);
  }
};
initializeDBAndServer();
//api2
const getFollowingPeoplesUserId = async (username) => {
  const getFollowingPeopleQuery = `
    SELECT following_user_id FROM follower INNER JOIN user ON 
    follower.follower_user_id=user.user_id
    WHERE user.username='${username}';`;

  const peopleQuery = await db.all(getFollowingPeopleQuery);
  const arrayOfId = peopleQuery.map((eachData) => eachData.following_user_id);
  return arrayOfId;
};

//Authorization
const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken !== undefined) {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        request.userId = payload.userId;
        next();
      }
    });
  } else {
    response.status(401);
    response.send("Invalid JWT Token");
  }
};

//tweet access verification
const getTweetAccessVerification = async (request, response, next) => {
  const { userId } = request;
  const { tweetId } = request.params;
  const getTweetQuery = `
    SELECT * FROM tweet INNER JOIN follower ON tweet.user_id=follower.following_user_id
    WHERE tweet.tweet_id='${tweetId}' AND follower_user_id='${userId}';`;
  const tweet = await db.get(getTweetQuery);
  if (tweet === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    next();
  }
};

//post
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const postRegister = `
   SELECT * FROM user
   WHERE username='${username}';`;
  const dbUser = await db.get(postRegister);

  if (dbUser !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const createUserQuery = `
      INSERT INTO
      user(username, password, name, gender)
      VALUES
      (
          '${username}',
          '${hashedPassword}',
          '${name}',
          '${gender}');`;
      let newUserDetails = await db.run(createUserQuery);
      response.status(200);
      response.send("User created successfully");
    }
  }
});
//login
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUserLogin = `
    SELECT * FROM user
    WHERE username='${username}';`;
  const dbUser = await db.get(getUserLogin);

  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = { username: username, userId: dbUser.user_id };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

// api3 get first 4 tweets
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = request;
  const followingPeopleIds = await getFollowingPeoplesUserId(username);
  const getUserTweets = `
    SELECT 
    username,tweet, date_time as dateTime 
    FROM user INNER JOIN tweet ON user.user_id=tweet.user_id
    WHERE 
    user.user_id IN (${followingPeopleIds})
    ORDER BY date_time DESC
    LIMIT 4;`;
  const tweets = await db.all(getUserTweets);
  response.send(tweets);
});
// api4 get user following
app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username, userId } = request;
  const getQueryUser = `SELECT name FROM follower INNER JOIN user ON follower.following_user_id=user.user_id
    WHERE follower_user_id='${userId}';`;
  const getFollower = await db.all(getQueryUser);
  response.send(getFollower);
});

//get user followers api 5
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username, userId } = request;
  const getQueryUser = `SELECT DISTINCT name FROM follower INNER JOIN user ON user.user_id=follower.follower_user_id
      WHERE following_user_id='${userId}';`;
  const getFollower = await db.all(getQueryUser);
  response.send(getFollower);
});

//api 6
app.get(
  "/tweets/:tweetId/",
  authenticateToken,
  getTweetAccessVerification,
  async (request, response) => {
    const { username, userId } = request;
    const { tweetId } = request.params;
    const getTweetIdQuery = `
    SELECT tweet,
    (SELECT COUNT() FROM like WHERE tweet_id='${tweetId}') AS likes,
    (SELECT COUNT() FROM reply WHERE tweet_id='${tweetId}') AS replies,
    date_time AS dateTime
    FROM tweet
    WHERE tweet.tweet_id='${tweetId}' ;`;
    const tweet = await db.get(getTweetIdQuery);
    response.send(tweet);
  }
);
// api 7
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  getTweetAccessVerification,
  async (request, response) => {
    const { tweetId } = request.params;
    const getTweetLikeQuery = `
    SELECT username FROM user INNER JOIN like ON user.user_id=like.user_id
    WHERE like.tweet_id='${tweetId}';`;

    const tweetLike = await db.all(getTweetLikeQuery);
    const userArray = tweetLike.map((eachData) => eachData.username);
    response.send({ likes: userArray });
  }
);

// api 8
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  getTweetAccessVerification,
  async (request, response) => {
    const { tweetId } = request.params;
    const getTweetRepliesQuery = `
    SELECT name, reply FROM user INNER JOIN reply ON user.user_id=reply.user_id
    WHERE tweet_id='${tweetId}';`;

    const tweetLike = await db.all(getTweetRepliesQuery);
    response.send({ replies: tweetLike });
  }
);
//api 9
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { userId } = request;
  const getTweetIdQuery = `
    SELECT tweet,
    COUNT(DISTINCT like.like_id) AS likes ,
    COUNT(DISTINCT reply.reply_id) AS replies,
    date_time AS dateTime
    FROM tweet LEFT JOIN reply ON tweet.tweet_id=reply.tweet_id
    LEFT JOIN like ON tweet.tweet_id=like.tweet_id
    WHERE tweet.user_id='${userId}'
    GROUP BY tweet.tweet_id;`;
  const tweets = await db.all(getTweetIdQuery);
  response.send(tweets);
});
//api 10
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request.body;
  const user_id = parseInt(request.user_id);
  const newTweetQuery = `
    INSERT INTO 
    tweet (tweet, user_id)
    VALUES(
        '${tweet}', '${user_id}');`;
  const postQuery = await db.run(newTweetQuery);
  response.send("Created a Tweet");
});
// api 11 delete
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { userId } = request;
    const getDeleteQuery = `
    SELECT * FROM tweet WHERE user_id='${userId}' AND tweet_id='${tweetId}';`;
    const dbDelete = await db.get(getDeleteQuery);
    if (dbDelete === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const getDeleted = `
        DELETE FROM tweet WHERE tweet_id='${tweetId}';`;
      await db.run(getDeleted);
      response.send("Tweet Removed");
    }
  }
);
module.exports = app;
