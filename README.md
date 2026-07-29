# E-Commerce Backend API

A complete e-commerce backend built with Node.js, Express.js, and MongoDB. This API provides all the necessary endpoints for a full-featured e-commerce application including authentication, product management, orders, payments, wishlist, and more.

## Features

### Authentication
- ✅ User Registration with Email Verification (OTP)
- ✅ User Login
- ✅ OTP Verification
- ✅ Forgot Password
- ✅ Reset Password
- ✅ Logout
- ✅ JWT-based Authentication

### Products
- ✅ Get All Products (with filtering, sorting, pagination)
- ✅ Get Single Product
- ✅ Create Product (Admin)
- ✅ Update Product (Admin)
- ✅ Delete Product (Admin)
- ✅ Product Categories and Types
- ✅ Product Variants (Size, Color, Quantity)
- ✅ Check Product Availability

### Orders
- ✅ Create Order
- ✅ Get User Orders
- ✅ Get Single Order
- ✅ Get All Orders (Admin)
- ✅ Update Order Status (Admin)
- ✅ Cancel Order
- ✅ Order Tracking

### Wishlist
- ✅ Get Wishlist
- ✅ Add to Wishlist
- ✅ Remove from Wishlist
- ✅ Clear Wishlist

### User Profile
- ✅ Get Profile
- ✅ Update Profile
- ✅ Change Password

### Payment
- ✅ Stripe Payment Integration
- ✅ Create Payment Intent
- ✅ Confirm Payment
- ✅ Get Payment Status

## Tech Stack

- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **MongoDB** - Database
- **Mongoose** - ODM for MongoDB
- **JWT** - Authentication
- **Stripe** - Payment gateway
- **Nodemailer** - Email service
- **Bcryptjs** - Password hashing

## Installation

1. Clone the repository or navigate to the project directory:
```bash
cd ecommerce-backend
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory and add the following variables:
```env
# Server Configuration
PORT=5000
NODE_ENV=development

# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/ecommerce

# JWT Configuration
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRE=7d

# Email Configuration (for OTP and password reset)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password
EMAIL_FROM_NAME=E-commerce Store

# Frontend URL
FRONTEND_URL=http://localhost:3000

# Stripe Payment Gateway
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key
```

4. Start the server:
```bash
# Development mode (with nodemon)
npm run dev

# Production mode
npm start
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/verify-otp` - Verify email with OTP
- `POST /api/auth/login` - Login user
- `POST /api/auth/forgot-password` - Request password reset
- `PUT /api/auth/reset-password/:resettoken` - Reset password
- `POST /api/auth/logout` - Logout user (Protected)
- `GET /api/auth/me` - Get current user (Protected)

### Products
- `GET /api/products` - Get all products (with query params: keyword, category, type, minPrice, maxPrice, sortBy, page, limit)
- `GET /api/products/:id` - Get single product
- `POST /api/products/:id/check-availability` - Check product availability
- `POST /api/products` - Create product (Admin, Protected)
- `PUT /api/products/:id` - Update product (Admin, Protected)
- `DELETE /api/products/:id` - Delete product (Admin, Protected)

### Categories
- `GET /api/categories` - Get all categories
- `GET /api/categories/:id` - Get single category
- `POST /api/categories` - Create category (Admin, Protected)
- `PUT /api/categories/:id` - Update category (Admin, Protected)
- `DELETE /api/categories/:id` - Delete category (Admin, Protected)

### Orders
- `POST /api/orders` - Create new order (Protected)
- `GET /api/orders/myorders` - Get user orders (Protected)
- `GET /api/orders/:id` - Get single order (Protected)
- `GET /api/orders/:id/tracking` - Get order tracking (Protected)
- `PUT /api/orders/:id/cancel` - Cancel order (Protected)
- `GET /api/orders` - Get all orders (Admin, Protected)
- `PUT /api/orders/:id/status` - Update order status (Admin, Protected)

### Wishlist
- `GET /api/wishlist` - Get user wishlist (Protected)
- `POST /api/wishlist` - Add product to wishlist (Protected)
- `DELETE /api/wishlist/:productId` - Remove product from wishlist (Protected)
- `DELETE /api/wishlist` - Clear wishlist (Protected)

### User Profile
- `GET /api/users/profile` - Get user profile (Protected)
- `PUT /api/users/profile` - Update user profile (Protected)
- `PUT /api/users/change-password` - Change password (Protected)

### Payment
- `POST /api/payment/create-payment-intent` - Create payment intent (Protected)
- `POST /api/payment/confirm` - Confirm payment (Protected)
- `GET /api/payment/status/:paymentIntentId` - Get payment status (Protected)

### Health Check
- `GET /api/health` - Server health check

## Request/Response Examples

### Register User
```json
POST /api/auth/register
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "phone": "+1234567890"
}
```

### Create Product
```json
POST /api/products
{
  "name": "Nike Air Max",
  "description": "Comfortable running shoes",
  "category": "category_id",
  "type": "Shoes",
  "brand": "Nike",
  "images": ["image1.jpg", "image2.jpg"],
  "variants": [
    {
      "size": "10",
      "color": "Black",
      "quantity": 50,
      "price": 120
    },
    {
      "size": "10",
      "color": "White",
      "quantity": 30,
      "price": 120
    }
  ],
  "basePrice": 120,
  "discount": 10,
  "tags": ["sports", "running"],
  "specifications": {
    "material": "Leather",
    "weight": "500g"
  }
}
```

### Create Order
```json
POST /api/orders
{
  "orderItems": [
    {
      "product": "product_id",
      "name": "Nike Air Max",
      "quantity": 1,
      "size": "10",
      "color": "Black",
      "price": 120,
      "image": "image1.jpg"
    }
  ],
  "shippingAddress": {
    "street": "123 Main St",
    "city": "New York",
    "state": "NY",
    "zipCode": "10001",
    "country": "USA",
    "phone": "+1234567890"
  },
  "paymentMethod": "stripe",
  "itemsPrice": 120,
  "taxPrice": 10,
  "shippingPrice": 5,
  "totalPrice": 135
}
```

## Authentication

Most endpoints require authentication. Include the JWT token in the Authorization header:

```
Authorization: Bearer <your_jwt_token>
```

## Error Handling

The API uses a centralized error handling middleware. Errors are returned in the following format:

```json
{
  "success": false,
  "message": "Error message"
}
```

## Database Models

### User
- name, email, password, phone, address
- isEmailVerified, otp, otpExpire
- resetPasswordToken, resetPasswordExpire
- role (user/admin)

### Product
- name, description, category, type, brand
- images, variants (size, color, quantity, price)
- basePrice, discount, rating, numReviews
- isAvailable, tags, specifications

### Order
- user, orderItems, shippingAddress
- paymentMethod, paymentResult
- itemsPrice, taxPrice, shippingPrice, totalPrice
- status, isPaid, isDelivered
- tracking (array of status updates)
- orderNumber

### Wishlist
- user, products (array)

### Category
- name, description, image, isActive

## Security Features

- Password hashing with bcrypt
- JWT token authentication
- Protected routes with middleware
- Role-based access control (Admin/User)
- Input validation
- CORS enabled

## Development

The project uses nodemon for development, which automatically restarts the server on file changes.

```bash
npm run dev
```

## License

ISC

## Author

Created as a complete e-commerce backend solution.

