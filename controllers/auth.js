const User = require("../models/User");
const fetch = require("node-fetch");
const base = "https://api-m.sandbox.paypal.com";
const ErrorResponse = require("../utlis/errorresponse.js");
const catchAsyncerror = require("../middleware/catchAsyncerror");
const jwt = require("jsonwebtoken");
var cloudinary = require("cloudinary").v2;
const emailValidator = require("deep-email-validator");
const { expressjwt } = require("express-jwt");
const paypal = require("../payment/payment.js");
const { CLIENT_ID, APP_SECRET } = process.env;
async function generateAccessToken() {
  const auth = Buffer.from(CLIENT_ID + ":" + APP_SECRET).toString("base64");
  const response = await fetch(`${base}/v1/oauth2/token`, {
    method: "post",
    body: "grant_type=client_credentials",
    headers: {
      Authorization: `Basic ${auth}`,
    },
  });
  const data = await response.json();
  return data.access_token;
}
async function isEmailValid(email) {
  return emailValidator.validate(email);
}
async function capturePayment(orderId) {
  const accessToken = await generateAccessToken();
  const url = `${base}/v2/checkout/orders/${orderId}/capture`;
  const response = await fetch(url, {
    method: "post",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const data = await response.json();
  return data;
}
async function createOrder() {
  const accessToken = await generateAccessToken();
  const url = `${base}/v2/checkout/orders`;
  const response = await fetch(url, {
    method: "post",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: "USD",
            value: "100.00",
          },
        },
      ],
    }),
  });
  const data = await response.json();
  return data;
}
exports.register = catchAsyncerror(async (req, res, next) => {
  const {
    username,
    email,
    password,
    dob,
    gender,
    Name_of_card,
    card_no,
    Expiry,
    cvc,
    packages,
  } = req.body;

  console.log(req.body.Expiry);
  if (
    !username ||
    !email ||
    !password ||
    !dob ||
    !Name_of_card ||
    !card_no ||
    !Expiry ||
    !cvc ||
    !packages
  ) {
    return res.status(400).json("plese fill all input ");
  }
  if (password.length < 6) {
    return res.status(400).json("password must be 6 character long");
  }
  try {
    User.findOne({ email }, async (err, user) => {
      // const { valid, reason, validators } = await isEmailValid(email);
      // console.log(validators);

      if (user) {
        return res.status(500).json("user already registered");
      } else {
        const myCloud = await cloudinary.uploader.upload(
          "https://res.cloudinary.com/degu3b9yz/image/upload/v1659352924/avatars/blilsisofr6pbhnuxbte.png",
          {
            folder: "avatars",
            width: 150,
            crop: "scale",
          }
        );
        const user = await User.create({
          username,
          email,
          password,
          dob,
          gender,
          Name_of_card,
          card_no,
          Expiry,
          cvc,
          packages,
          paymentstatus,

          avatar: {
            public_id: myCloud.public_id,
            url: myCloud.secure_url,
          },
        });

        sendToken(user, 201, res);
      }
    });
  } catch (error) {
    console.log(error.message);
  }
});
exports.pay = catchAsyncerror(async (req, res, next) => {
  const order = await createOrder();
  console.log(order);
  res.json(order);
});
exports.ordercapture = catchAsyncerror(async (req, res, next) => {
  const { orderID } = req.params;
  try {
    const captureData = await capturePayment(orderID);
    console.log(captureData);
    res.json(captureData);
  } catch (err) {
    res.status(500).json(err);
  }
  next();
});
// exports.paym = catchAsyncerror(async (req, res) => {
//   const newUserData = {
//     paymentstatus: true,
//   };

  // await User.findByIdAndUpdate(req.user.id, newUserData, {
  //   new: true,
  //   runValidators: true,
  //   useFindAndModify: false,
  // });
  // res.status(200).json({
  //   success: "updated",
  // });
// });

exports.login = catchAsyncerror(async (req, res, next) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return next(new ErrorResponse("please provide email&password", 400));
  }

  try {
    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res.status(500).json("invalid credentials user not found");
    }
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(500).json("password is not valid please register");
    }
    // res.status(201).json(user)

    sendToken(user, 200, res);
  } catch (error) {
    throw new Error(error);

    // res.status(500).json({ success: false });
  }
});

exports.isAuthuser = catchAsyncerror(async (req, res, next) => {
  const { token } = req.cookies;
  // console.log(token);
  if (!token) {
    return next(new ErrorResponse("plese login to access this resource", 401));
  }
  const decodedData = jwt.verify(token, process.env.JWT_SECRET);
  req.user = await User.findById(decodedData.id);
  next();
});
exports.dashboard = catchAsyncerror(async (req, res, next) => {
  if (req.session) {
    console.log(req.session.email);
  }
  const user = await User.findById(req.user.id);

  res.status(200).json({
    sucess: true,
    user,
  });
});
exports.logout = catchAsyncerror(async (req, res, next) => {
  await res.cookie("token", null, {
    expires: new Date(Date.now()),
    httpOnly: true,
  });

  res.status(200).json({
    success: true,
    message: "Logged Out",
  });
});
exports.requireSignin = catchAsyncerror(async (req, res, next) => {
  expressjwt({
    secret: config.jwtSecret,
    userProperty: "auth",
  });
});
// update User password
exports.updatePassword = catchAsyncerror(async (req, res, next) => {
  const user = await User.findById(req.user.id).select("+password");
  console.log(req.body);
  const isPasswordMatched = await user.matchPassword(req.body.oldPassword);

  if (!isPasswordMatched) {
    return res.status(400).json({ message: "Old password is incorrect" });
  }

  if (req.body.newPassword !== req.body.confirmPassword) {
    return res.status(400).json({ message: "password does not match" });
  }

  user.password = req.body.newPassword;

  await user.save();

  sendToken(user, 200, res);
});
// update User Profile
exports.updateProfile = catchAsyncerror(async (req, res, next) => {
  const newUserData = {
    username: req.body.username,
    dob: req.body.dob,
    gender: req.body.gender,
    Name_of_card: req.body.Name_of_card,
    card_no: req.body.card_no,
    Expiry: req.body.Expiry,
    cvc: req.body.cvc,
    packages: req.body.packages,
  };

  await User.findByIdAndUpdate(req.user.id, newUserData, {
    new: true,
    runValidators: true,
    useFindAndModify: false,
  });
  res.status(200).json({
    success: "updated",
  });
});
exports.profilepic = catchAsyncerror(async (req, res, next) => {
  const newUserData = {
    avatar: req.body.avatar,
  };
  if (req.body.avatar) {
    const user = await User.findById(req.user.id);
    const imageId = user.avatar.public_id;

    cloudinary.uploader.destroy(imageId);

    const myCloud = await cloudinary.uploader.upload(req.body.avatar, {
      folder: "horse",
      // width: 150,
      crop: "scale",
    });

    newUserData.avatar = {
      public_id: myCloud.public_id,
      url: myCloud.secure_url,
    };
    await User.findByIdAndUpdate(req.user.id, newUserData, {
      new: true,
      runValidators: true,
      useFindAndModify: false,
    });
    res.status(200).json({
      success: "updated",
    });
  }
});

const sendToken = (user, statusCode, res) => {
  const token = user.getSignedToken();
  // option for cookie
  const options = {
    expire: new Date(Date.now + 24 * 60 * 60 * 1000),
    httpOnly: true,
  };
  res.status(statusCode).cookie("token", token, options).json({
    success: true,
    user,
    token,
  });
};
