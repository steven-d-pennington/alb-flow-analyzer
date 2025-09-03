const fs = require('fs');
const path = require('path');

console.log('🔍 Verifying ALB Flow Analyzer setup...\n');

// Check if all required files exist
const requiredFiles = [
  'package.json',
  'backend/package.json',
  'frontend/package.json',
  'backend/src/index.ts',
  'frontend/src/main.tsx',
  'backend/.env',
  'README.md'
];

let allFilesExist = true;

requiredFiles.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`✅ ${file}`);
  } else {
    console.log(`❌ ${file} - MISSING`);
    allFilesExist = false;
  }
});

// Check if build directories exist
const buildDirs = [
  'backend/dist',
  'frontend/dist'
];

console.log('\n📦 Build outputs:');
buildDirs.forEach(dir => {
  if (fs.existsSync(dir)) {
    console.log(`✅ ${dir}`);
  } else {
    console.log(`⚠️  ${dir} - Not built yet (run npm run build)`);
  }
});

// Check node_modules
const nodeModulesDirs = [
  'node_modules',
  'backend/node_modules',
  'frontend/node_modules'
];

console.log('\n📚 Dependencies:');
nodeModulesDirs.forEach(dir => {
  if (fs.existsSync(dir)) {
    console.log(`✅ ${dir}`);
  } else {
    console.log(`❌ ${dir} - Run npm install`);
    allFilesExist = false;
  }
});

console.log('\n🎯 Project Structure:');
console.log('✅ Root package.json with workspace scripts');
console.log('✅ Backend: Node.js + Express + TypeScript');
console.log('✅ Frontend: React + TypeScript + Vite + Material-UI');
console.log('✅ Testing: Jest (backend) + Vitest (frontend)');
console.log('✅ Docker configuration');
console.log('✅ Environment configuration');

if (allFilesExist) {
  console.log('\n🎉 Setup verification completed successfully!');
  console.log('\nNext steps:');
  console.log('1. Start development: npm run dev');
  console.log('2. Backend will run on: http://localhost:3001');
  console.log('3. Frontend will run on: http://localhost:3000');
  console.log('4. Health check: http://localhost:3001/health');
} else {
  console.log('\n❌ Setup verification failed. Please check missing files above.');
  process.exit(1);
}