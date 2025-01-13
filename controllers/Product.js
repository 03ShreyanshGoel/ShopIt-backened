const formidable = require("formidable");
const { validationResult } = require("express-validator");
const cloudinary = require("cloudinary").v2;
const ProductModel = require("../models/ProductModel");

// Cloudinary configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Helper function to validate Cloudinary image URLs
const isValidImageUrl = (url) => {
  return url && url.startsWith("https://res.cloudinary.com") && /\.(jpg|jpeg|png)$/i.test(url);
};

class Product {
  // Create a new product
  async create(req, res) {
    const form = formidable({ multiples: true });
    form.parse(req, async (err, fields, files) => {
      if (err) {
        console.log(err,fields,files)
        console.log("Error parsing form:", err);
        return;
      }
  
      const parsedData = JSON.parse(fields.data);
      const errors = [];
  
      // Input validation
      if (parsedData.title.trim().length === 0) errors.push({ msg: "Title is required" });
      if (parseInt(parsedData.price) < 1) errors.push({ msg: "Price should be above $1" });
      if (parseInt(parsedData.discount) < 0) errors.push({ msg: "Discount should not be negative" });
      if (parseInt(parsedData.stock) < 20) errors.push({ msg: "Stock should be above 20" });
      if (fields.description.trim().length === 0) errors.push({ msg: "Description is required" });
  
      // Validate images and upload them to Cloudinary
      const images = {};
      for (let i = 1; i <= 3; i++) {
        const imageField = `image${i}`;
        const imageUrl = fields[imageField];
  
        if (!imageUrl) {
          errors.push({ msg: `${imageField} is required` });
        } else if (!isValidImageUrl(imageUrl)){
          errors.push({ msg: `${imageField} must be a valid Cloudinary image URL with .jpg, .jpeg, or .png extension` });
        } else {
          // Upload image to Cloudinary under 'products' folder
          const uploadedImage = await cloudinary.uploader.upload(imageUrl, {
            folder: 'products',
          });
          images[imageField] = uploadedImage.secure_url;
        }
      }
  
      // If there are validation errors, send response
      if (errors.length > 0) {
        return res.status(400).json({ errors });
      }
  
      try {
        // Create product in the database
        const response = await ProductModel.create({
          title: parsedData.title,
          price: parseInt(parsedData.price),
          discount: parseInt(parsedData.discount),
          stock: parseInt(parsedData.stock),
          category: parsedData.category,
          colors: parsedData.colors,
          sizes: JSON.parse(fields.sizes),
          image1: images.image1,
          image2: images.image2,
          image3: images.image3,
          description: fields.description,
        });
  
        return res.status(201).json({ msg: "Product has been created", response });
      } catch (error) {
        console.log(error);
        return res.status(500).json(error);
      }
    });
  }
  

  // Get paginated list of products
  async get(req, res) {
    const { page } = req.params;
    const perPage = 5;
    const skip = (page - 1) * perPage;
    try {
      const count = await ProductModel.find({}).countDocuments();
      const response = await ProductModel.find({})
        .skip(skip)
        .limit(perPage)
        .sort({ updatedAt: -1 });
      return res.status(200).json({ products: response, perPage, count });
    } catch (error) {
      console.log(error.message);
    }
  }


  // Get details of a single product
  async getProduct(req, res) {
    const { id } = req.params;
    try {
      const product = await ProductModel.findOne({ _id: id });
      return res.status(200).json(product);
    } catch (error) {
      return res.status(500).json({ error: error.message });
      console.log(error.message);
    }
  }
  async updateProduct(req, res) {
    const errors = validationResult(req);
    if (errors.isEmpty()) {
      try {
        const {
          _id,
          title,
          price,
          discount,
          stock,
          colors,
          sizes,
          description,
          category,
        } = req.body;
        const response = await ProductModel.updateOne(
          { _id },
          {
            $set: {
              title,
              price,
              discount,
              stock,
              category,
              colors,
              sizes,
              description,
            },
          }
        );
        return res.status(200).json({ msg: "Product has updated", response });
      } catch (error) {
        console.log(error);
        return res.status(500).json({ errors: error });
      }
    } else {
      return res.status(400).json({ errors: errors.array() });
    }
  }


  // Delete a product and its images
  async deleteProduct(req, res) {
    const { id } = req.params;
  
    try {
      const product = await ProductModel.findById(id);
      if (!product) {
        return res.status(404).json({ msg: "Product not found" });
      }
  
      // Delete product images from Cloudinary (images in the 'products' folder)
      const imageUrls = [product.image1, product.image2, product.image3];
      await Promise.all(
        imageUrls.map(async (imageUrl) => {
          const imagePublicId = imageUrl.split("/").pop().split(".")[0];
          await cloudinary.uploader.destroy(`products/${imagePublicId}`);
        })
      );
  
      // Delete the product from the database
      await ProductModel.findByIdAndDelete(id);
      return res.status(200).json({ msg: "Product has been deleted successfully" });
    } catch (error) {
      console.error("Error deleting product:", error.message);
      return res.status(500).json({ msg: "Error deleting product" });
    }
  }
  
}

module.exports = new Product();
