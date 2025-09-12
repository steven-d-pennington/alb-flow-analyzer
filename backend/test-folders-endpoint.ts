// Test the new /folders endpoint
import { S3IntegrationService } from './src/s3/S3IntegrationService';
import { AuthenticationService } from './src/auth/AuthenticationService';

async function testFoldersEndpoint() {
    console.log('=== TESTING NEW FOLDERS ENDPOINT ===');
    
    try {
        // Get credentials (use environment or default session)
        const authService = AuthenticationService.getInstance();
        const defaultToken = authService.getDefaultSessionToken();
        
        if (!defaultToken) {
            console.error('❌ No credentials available');
            return;
        }
        
        const credentials = await authService.getCredentials(defaultToken);
        console.log('✅ Got credentials');
        
        // Test the listFolders method directly
        const s3Service = new S3IntegrationService();
        const bucketName = 'prod-alb-crm-app-pub-hdhd728hks82hhd';
        const prefix = 'AWSLogs/291787221480/elasticloadbalancing/us-east-1/2025/08/';
        
        console.log('🔍 Testing folder listing for August 2025...');
        console.log('   Bucket:', bucketName);
        console.log('   Prefix:', prefix);
        
        const folders = await s3Service.listFolders(bucketName, prefix, credentials);
        
        console.log('\\n📁 Found folders:');
        console.log('   Total count:', folders.length);
        folders.forEach((folder, i) => {
            console.log('  ', (i + 1).toString().padStart(2), ':', folder);
        });
        
        if (folders.length === 30) {
            console.log('\\n🎉 SUCCESS! Found all 30 expected folders for August 2025');
        } else {
            console.log('\\n⚠️  Expected 30 folders but found', folders.length);
        }
        
        // Test a few specific dates we expect
        const expectedDates = ['01', '02', '15', '30', '31'];
        const missing = expectedDates.filter(date => !folders.includes(date));
        
        if (missing.length === 0) {
            console.log('✅ All expected sample dates found');
        } else {
            console.log('❌ Missing expected dates:', missing);
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

testFoldersEndpoint().catch(console.error);