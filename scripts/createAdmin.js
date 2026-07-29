const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/User');

// Load env vars
dotenv.config();

const createAdmin = async () => {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB Connected...');

    // Check if admin already exists
    const adminExists = await User.findOne({ email: 'admin@admin.com' });
    if (adminExists) {
      console.log('Admin user already exists!');
      console.log('Email: admin@admin.com');
      console.log('Password: Admin@123');
      process.exit(0);
    }

    // Create admin user (password will be hashed by the model's pre-save hook)
    const admin = await User.create({
      name: 'Master Admin',
      email: 'admin@admin.com',
      password: 'Admin@123', // Will be hashed automatically by the model
      phone: '+1234567890',
      role: 'admin',
      isEmailVerified: true,
      address: {
        street: 'Admin Street',
        city: 'Admin City',
        state: 'Admin State',
        zipCode: '12345',
        country: 'USA',
      },
    });

    console.log('✅ Master Admin created successfully!');
    console.log('\n📧 Login Credentials:');
    console.log('   Email: admin@admin.com');
    console.log('   Password: Admin@123');
    console.log('\n⚠️  Please change the password after first login!');
    
    process.exit(0);
  } catch (error) {
    console.error('Error creating admin:', error.message);
    process.exit(1);
  }
};

createAdmin();

