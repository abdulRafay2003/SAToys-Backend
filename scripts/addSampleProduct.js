const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Product = require('../models/Product');
const Category = require('../models/Category');

// Load env vars
dotenv.config();

const addSampleProduct = async () => {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB Connected...');

    // Check if product already exists
    const productExists = await Product.findOne({ name: /nike air max/i });
    if (productExists) {
      console.log('Nike Air Max product already exists!');
      console.log('Product ID:', productExists._id);
      process.exit(0);
    }

    // Get or create Shoes category
    let category = await Category.findOne({ name: /shoes/i });
    if (!category) {
      category = await Category.create({
        name: 'Shoes',
        description: 'Footwear category',
        isActive: true,
      });
      console.log('Created category: Shoes');
    }

    // Create Nike Air Max product
    const product = await Product.create({
      name: 'Nike Air Max Shoes',
      description: 'Experience ultimate comfort and style with the Nike Air Max Shoes. Featuring innovative Air cushioning technology, these shoes provide exceptional comfort and support for all-day wear. Perfect for running, walking, or casual wear.',
      category: category._id,
      type: 'Running Shoes',
      brand: 'Nike',
      basePrice: 120.00,
      discount: 10,
      images: [
        'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500',
        'https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=500',
        'https://images.unsplash.com/photo-1608231387042-66d1773070a5?w=500',
      ],
      variants: [
        {
          size: '8',
          color: 'Black',
          quantity: 25,
          price: 120.00,
        },
        {
          size: '8',
          color: 'White',
          quantity: 20,
          price: 120.00,
        },
        {
          size: '9',
          color: 'Black',
          quantity: 30,
          price: 120.00,
        },
        {
          size: '9',
          color: 'White',
          quantity: 25,
          price: 120.00,
        },
        {
          size: '10',
          color: 'Black',
          quantity: 35,
          price: 120.00,
        },
        {
          size: '10',
          color: 'White',
          quantity: 30,
          price: 120.00,
        },
        {
          size: '11',
          color: 'Black',
          quantity: 20,
          price: 120.00,
        },
        {
          size: '11',
          color: 'White',
          quantity: 15,
          price: 120.00,
        },
      ],
      rating: 4.5,
      numReviews: 128,
      isAvailable: true,
      tags: ['running', 'sports', 'athletic', 'comfortable', 'nike', 'air max'],
      specifications: {
        material: 'Synthetic Leather and Mesh',
        sole: 'Rubber',
        closure: 'Lace-up',
        weight: '300g',
        technology: 'Air Cushioning',
      },
    });

    console.log('✅ Nike Air Max Shoes product created successfully!');
    console.log('\n📦 Product Details:');
    console.log('   Name:', product.name);
    console.log('   Brand:', product.brand);
    console.log('   Base Price: $' + product.basePrice);
    console.log('   Discount: ' + product.discount + '%');
    console.log('   Final Price: $' + (product.basePrice * (1 - product.discount / 100)).toFixed(2));
    console.log('   Category:', category.name);
    console.log('   Variants:', product.variants.length);
    console.log('   Total Stock:', product.variants.reduce((sum, v) => sum + v.quantity, 0));
    console.log('   Product ID:', product._id);
    
    process.exit(0);
  } catch (error) {
    console.error('Error creating product:', error.message);
    process.exit(1);
  }
};

addSampleProduct();

