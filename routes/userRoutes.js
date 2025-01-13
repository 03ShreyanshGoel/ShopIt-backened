const express = require("express");
const {
  registerValidations,
  loginValidations,
} = require("../validations/userValidations");
const router = express.Router();
const { register, login } = require("../controllers/userController");
router.post("/register", registerValidations, register);
router.post("/login", loginValidations, login);
module.exports = router;

