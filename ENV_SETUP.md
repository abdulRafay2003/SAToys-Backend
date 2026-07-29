# Environment Variables Setup

Create a `.env` file in the root directory with the following variables:

```env
# Server Configuration
PORT=5000
NODE_ENV=development

# MongoDB Configuration
# For local MongoDB:
MONGODB_URI=mongodb://localhost:27017/ecommerce
# For MongoDB Atlas (cloud):
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/ecommerce

# JWT Configuration
# Generate a strong random string for JWT_SECRET
JWT_SECRET=your_super_secret_jwt_key_here_make_it_long_and_random
JWT_EXPIRE=7d

# Email Configuration (for OTP and password reset)
# For Gmail, you need to use an App Password, not your regular password
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_gmail_app_password
EMAIL_FROM_NAME=E-commerce Store

# Frontend URL (for password reset links)
FRONTEND_URL=http://localhost:3000

# Stripe Payment Gateway
# Get these from your Stripe Dashboard: https://dashboard.stripe.com/apikeys
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key
```

## Setup Instructions

### 1. MongoDB Setup
- **Local MongoDB**: Install MongoDB locally and ensure it's running
- **MongoDB Atlas**: Create a free cluster at https://www.mongodb.com/cloud/atlas and use the connection string

### 2. Email Setup (Gmail)
1. Go to your Google Account settings
2. Enable 2-Step Verification
3. Generate an App Password: https://myaccount.google.com/apppasswords
4. Use the generated app password in `EMAIL_PASS`

### 3. Stripe Setup
1. Create a Stripe account at https://stripe.com
2. Go to Developers > API keys
3. Copy your test keys (use live keys in production)
4. Add them to your `.env` file

### 4. JWT Secret
Generate a secure random string:
```bash
# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Important Notes

- Never commit your `.env` file to version control
- Use different values for development and production
- Keep your secrets secure and never share them publicly

