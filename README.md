# 📄 Go-Document System

A document management and workflow system for tracking document changes, approvals, and handovers across the entire document lifecycle.

## 🛠️ Quick Start - Database Setup

### 1. **Database Preparation**
Before running the project, make sure your MySQL database is properly configured.
🔹 Check `prisma/schema1.prisma` and `prisma/schema2.prisma` for database structure
🔹 Configure `.env` with MySQL connection details:

```env
# Database Configuration (replace with your MySQL server details)
DATABASE_URL_1=mysql://username:password@localhost:3306/godoc_users
DATABASE_URL_2=mysql://username:password@localhost:3306/godoc_documents
```

### 2. **Install Dependencies**
Run the following command to install all required dependencies:
```sh
npm install
```

### 3. **Generate Prisma Client**
After installing dependencies, run:
```sh
npm run prisma-generate
# or use individual commands:
# npx prisma generate --schema=prisma/schema1.prisma
# npx prisma generate --schema=prisma/schema2.prisma
```

### 4. **Synchronize Database with Prisma**
Ensure your database schema matches Prisma schemas:
```sh
npm run prisma-push
# or use individual commands:
# npx prisma db push --schema=prisma/schema1.prisma
# npx prisma db push --schema=prisma/schema2.prisma
```

### 5. **Check Database Connection**
Use this command to verify the database connection:
```sh
npx ts-node src/config/dbCheck.ts
```

### 6. **Start the Development Server**
Once all configurations are complete, start the server with:
```sh
npm run dev
```
The server will be available at `http://localhost:3000` (or the configured PORT).

## 🧱 System Overview

The Go-Document System is built with:

- **Backend**: Node.js, Express, TypeScript
- **Database**: MySQL with Prisma ORM (dual database setup)
- **Authentication**: JWT-based authentication
- **Notification System**: Nodemailer for email notifications

### Core Features

- **Document Workflow Management**: Track documents from proposal to completion
- **Proposed Changes**: Create and manage document changes
- **Authorization Documents**: Generate authorizations with approval workflows
- **Handover Documents**: Manage document handovers with multi-step approvals
- **Support Documents**: Handle supplementary documentation with versioning
- **Email Notifications**: Automated notifications for status changes

## ⚙️ Development Scripts

The `package.json` includes several useful scripts for working with the Prisma schema and database:

```json
"scripts": {
  "dev": "ts-node-dev --respawn --transpile-only src/server.ts",
  "migrate:db1": "npx prisma migrate dev --schema=prisma/schema1.prisma",
  "migrate:db2": "npx prisma migrate dev --schema=prisma/schema2.prisma",
  "migrate": "npm run migrate:db1 && npm run migrate:db2",
  "generate:db1": "npx prisma generate --schema=prisma/schema1.prisma",
  "generate:db2": "npx prisma generate --schema=prisma/schema2.prisma",
  "prisma-generate": "npm run generate:db1 && npm run generate:db2",
  "prisma-push": "npx prisma db push --schema=prisma/schema1.prisma && npx prisma db push --schema=prisma/schema2.prisma",
  "start": "node src/server.ts",
  "build": "tsc"
}
```

## 📁 Database Structure

The application uses two separate database schemas:

1. **schema1.prisma** - User management database
2. **schema2.prisma** - Document management database

Key tables in the document schema (`schema2.prisma`):
- `tr_proposed_changes` - Document change proposals
- `tr_authorization_doc` - Authorization documents
- `tr_handover` - Handover documents
- `tbl_support_document` - Supporting documentation
- `mst_authorization` - User authorizations and access control

## 📊 API Endpoints Reference

### Main Workflows

#### Proposed Changes 
- `GET /api/proposedchanges` - Get all proposed changes
- `POST /api/proposedchanges` - Create a new proposed change
- `PUT /api/proposedchanges/:id` - Update a proposed change
- `GET /api/proposedchanges/:id` - Get a specific proposed change

#### Authorization Documents
- `GET /api/authdoc` - Get all authorization documents
- `POST /api/authdoc` - Create a new authorization document
- `PUT /api/authdoc/:id` - Update an authorization document
- `POST /api/authstatus` - Update approval status

#### Handover Documents
- `GET /api/handover` - Get all handover documents
- `POST /api/handover` - Create a new handover
- `PUT /api/handover/:id` - Update a handover
- `POST /api/approvalhandover` - Update approval status

### Authentication

- `POST /api/users/login` - User login
- `POST /api/users/loginUserGodoc` - Application login

## 💾 Document Storage and Email System

### File Storage
Files are stored in the `src/uploads` directory with features for:
- Versioning
- Viewing and downloading
- Watermarking documents

### Email Notification
The system uses Nodemailer with an idempotent delivery system:

```typescript
// Email configuration
const transport = nodemailer.createTransport({
  host: "mail.aio.co.id",
  port: 587,
  secure: false,
  auth: {
    user: "appsskb@aio.co.id",
    pass: "Plicaskb1234",
  },
  tls: {
    rejectUnauthorized: false,
  }
});
```

Emails are tracked to ensure they're sent only once for each unique action.

## ⚠️ Troubleshooting Database Issues

### Common Database Problems

1. **Schema Synchronization Issues**
   - If you encounter schema errors, try running these commands in sequence:
   ```sh
   npm run prisma-generate
   npm run prisma-push
   ```
   
   - For more specific control:
   ```sh
   # Pull current database schema
   npx prisma db pull --schema=prisma/schema1.prisma
   npx prisma db pull --schema=prisma/schema2.prisma
   
   # Generate client after changes
   npx prisma generate --schema=prisma/schema1.prisma
   npx prisma generate --schema=prisma/schema2.prisma
   
   # Push schema changes to database
   npx prisma db push --schema=prisma/schema1.prisma
   npx prisma db push --schema=prisma/schema2.prisma
   ```

2. **Connection Issues**
   - Verify MySQL is running
   - Check database credentials in `.env` file
   - Try running schema validation:
   ```sh
   npx prisma validate --schema=prisma/schema1.prisma
   npx prisma validate --schema=prisma/schema2.prisma
   ```

3. **Database Reset (if needed)**
   - Reset development database:
   ```sh
   npx prisma migrate reset --schema=prisma/schema1.prisma
   npx prisma migrate reset --schema=prisma/schema2.prisma
   ```

### 🔍 Application Troubleshooting

1. **Email Sending Issues**
   - Check email configuration
   - Verify SMTP server is accessible
   - Check for rate limiting or authentication issues

2. **File Upload Problems**
   - Ensure the uploads directory is writable
   - Check file size limits in configuration
   - Verify supported file types

### 📊 System States

#### Document Workflow States
- `submitted`: Initially submitted for review
- `approved`: Approved by all required approvers
- `not_approved`: Not approved by at least one approver
- `rejected`: Rejected by at least one approver
- `done`: Completed and ready for next stage
- `onprogress`: In progress through the approval workflow

### 🚀 Deployment

For production deployment:

1. Build the application:
```sh
npm run build
```

2. Set up environment variables for production:
```env
NODE_ENV=production
PORT=7777
CORS_ORIGIN=https://your-frontend-domain.com
```


Consider using a process manager like PM2 for production deployments:
```sh
pm2 start dist/server.js --name "go-document-system"
```

## 📝 Notes

- This application uses dual database setup with Prisma ORM
- Always run Prisma commands with the correct schema reference
- All database operations are logged with descriptive console messages
- The system follows a multi-step approval workflow for documents

Happy coding! 🚀# Godoc_BE
# Godoc_BE
# New_Godoc_BE
