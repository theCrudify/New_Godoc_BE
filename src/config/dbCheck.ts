import { prismaDB1, prismaDB2 } from "./database";

const checkDatabaseConnection = async () => {
    try {
        await prismaDB1.$connect();
        console.log('✅ Database 1 connected successfully!');

        await prismaDB2.$connect();
        console.log('✅ Database 2 connected successfully!');
    } catch (error) {
        console.error('❌ Database connection failed:', error);
    } finally {
        await prismaDB1.$disconnect();
        await prismaDB2.$disconnect();
    }
};

checkDatabaseConnection();
