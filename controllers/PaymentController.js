const stripe = require("stripe")(process.env.STRIPE_KEY);
const User = require("../models/User");
const OrderModel = require("../models/OrderModel");
const ProductModel = require("../models/ProductModel");

class PaymentController {
  async paymentProcess(req, res, next) {
    const { cart, id } = req.body;
    console.log("Starting payment process...");
    console.log("Received cart:", cart);
    console.log("Received user ID:", id);

    const user = await User.findOne({ _id: id });
    if (!user) {
      console.error("User not found for ID:", id);
      return res.status(404).json({ error: "User not found" });
    }
    console.log("User found:", user);

    const orderData = cart.map((item) => {
      console.log("Processing cart item:", item);
      return {
        _id: item._id,
        size: item.size,
        color: item.color,
        quantity: item.quantity,
        userId: user._id,
      };
    });

    console.log("Order data prepared:", orderData);

    const customer = await stripe.customers.create({
      email: user.email,
      metadata: {
        cart: JSON.stringify(orderData),
      },
    });

    console.log("Stripe customer created:", customer.id);

    const session = await stripe.checkout.sessions.create({
      shipping_address_collection: {
        allowed_countries: ["PK", "IN", "BD"],
      },
      shipping_options: [
        {
          shipping_rate_data: {
            type: "fixed_amount",
            fixed_amount: {
              amount: 0,
              currency: "usd",
            },
            display_name: "Free shipping",
            delivery_estimate: {
              minimum: {
                unit: "business_day",
                value: 5,
              },
              maximum: {
                unit: "business_day",
                value: 7,
              },
            },
          },
        },
      ],
      line_items: cart.map((item) => {
        console.log("Creating line item for:", item);
        const percentage = item.discount / 100;
        let actualPrice = Math.round(item.price - item.price * percentage);
        actualPrice = parseFloat(actualPrice);
        actualPrice = actualPrice * 100;
        actualPrice = actualPrice.toFixed(2);
        return {
          price_data: {
            currency: "usd",
            product_data: {
              name: item.title,
            },
            unit_amount_decimal: actualPrice,
          },
          quantity: item.quantity,
        };
      }),
      customer: customer.id,
      mode: "payment",
      success_url: `${process.env.CLIENT}/user?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT}/cart`,
    });

    console.log("Stripe checkout session created:", session.id);
    res.json({ url: session.url });
  }

  async checkOutSession(request, response) {
    console.log("Webhook received...");
    const sig = request.headers["stripe-signature"];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        request.rawBody,
        sig,
        process.env.ENDPOINTSECRET
      );
      console.log("Webhook event successfully verified:", event.type);
    } catch (err) {
      console.error("Webhook verification failed:", err.message);
      return response.status(400).send(`Webhook Error: ${err.message}`);
    }

    switch (event.type) {
      case "payment_intent.succeeded":
        console.log("Payment succeeded:", event.data.object);
        break;

      case "checkout.session.completed":
        console.log("Checkout session completed event received...");
        const data = event.data.object;
        console.log("Session data:", data);

        let customer = await stripe.customers.retrieve(data.customer);
        console.log("Customer retrieved:", customer);

        customer = JSON.parse(customer?.metadata?.cart);
        console.log("Parsed customer cart:", customer);

        customer.forEach(async (ctr) => {
          try {
            console.log("Processing cart item:", ctr);
            let reviewStatus = false;

            const findOrder = await OrderModel.findOne({
              productId: ctr._id,
              userId: ctr.userId,
            })
              .where("review")
              .equals(true);

            if (findOrder) {
              reviewStatus = true;
            }

            const order = await OrderModel.create({
              productId: ctr._id,
              userId: ctr.userId,
              size: ctr.size,
              color: ctr.color,
              quantities: ctr.quantity,
              address: data.customer_details.address,
              review: reviewStatus,
            });
            console.log("Order created:", order);

            const product = await ProductModel.findOne({ _id: ctr._id });
            if (product) {
              let stock = product.stock - ctr.quantity;
              stock = Math.max(stock, 0);
              const updatedProduct = await ProductModel.findByIdAndUpdate(
                ctr._id,
                { stock },
                { new: true }
              );
              console.log("Product stock updated:", updatedProduct);
            }
          } catch (error) {
            console.error("Error processing cart item:", error.message);
            return response.status(500).json("Server internal error");
          }
        });
        break;

      default:
        console.warn(`Unhandled event type: ${event.type}`);
    }

    response.send();
  }

  async paymentVerify(req, res) {
    const { id } = req.params;
    console.log("Verifying payment for session ID:", id);

    try {
      const session = await stripe.checkout.sessions.retrieve(id);
      console.log("Payment session retrieved:", session);
      return res.status(200).json({
        msg: "Your payment has verfied successfully",
        status: session.payment_status,
      });
    } catch (error) {
      console.error("Error verifying payment:", error.message);
      return res.status(500).json(error.message);
    }
  }
}

module.exports = new PaymentController();
