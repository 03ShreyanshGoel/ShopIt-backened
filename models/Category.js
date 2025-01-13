const mongoose = require("mongoose");
const categorySchema = mongoose.Schema(
  {
    name: {
      type: String,
      rquired: true,
      unique: true,
    },
  },
  { timestamps: true }
);
module.exports = mongoose.model("categorie", categorySchema);
