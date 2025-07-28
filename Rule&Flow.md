# 📄 Go-Document System

A document management and workflow system for tracking document changes, approvals, and handovers. This system manages the entire document lifecycle from proposal to authorization and final handover.

## 🛠️ Features

- **Document Workflow Management**: Track the complete lifecycle of documents from proposal to completion
- **Proposed Changes**: Create and manage proposed document changes
- **Authorization Documents**: Generate and track document authorizations with approval workflows
- **Handover Documents**: Manage document handovers with multi-step approval processes
- **Support Documents**: Handle supplementary documentation with versioning
- **Email Notifications**: Automated email notifications for document status changes and approvals
- **User Management**: Organize users by department, section, and plant
- **Role-based Access Control**: Control permissions based on user roles

## 🧱 System Architecture

The system is built with:

- **Backend**: Node.js, Express, TypeScript
- **Database**: MySQL with Prisma ORM
- **Authentication**: JWT-based authentication
- **Notification System**: Nodemailer for email notifications

## 🚀 Getting Started

### Prerequisites

- Node.js (v14+)
- MySQL (v8+)
- npm or yarn

### Setup and Installation

1. **Clone the Repository**

```sh
git clone https://your-repository-url/Godoc_Backend.git
cd Godoc_Backend
```

2. **Environment Configuration**

Create a `.env` file in the root directory with the following variables:

```env
# Server Configuration
PORT=7777
NODE_ENV=development
CORS_ORIGIN=http://localhost:4200

# JWT Configuration
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=24h

# Database Configuration
DATABASE_URL_1=mysql://username:password@localhost:3306/godoc_users
DATABASE_URL_2=mysql://username:password@localhost:3306/godoc_documents
```

3. **Install Dependencies**

```sh
npm install
```

4. **Generate Prisma Client**

```sh
npm run prisma-generate
```

5. **Synchronize Database with Prisma Schema**

```sh
npm run prisma-push
```

6. **Start the Development Server**

```sh
npm run dev
```

The server will be available at `http://localhost:7777` (or the configured PORT).

## 📁 Project Structure

```
src/
├── config/              # Configuration files
├── main-structure/      # Core application logic
│   ├── Activity/        # Document activities (changes, approvals, etc.)
│   │   ├── Document/    # Document handling modules
│   │   ├── Email/       # Email notification services
│   ├── AuthenticationApps/ # Authentication logic
│   ├── MasterData/      # Master data management
│   └── ...
├── middleware/          # Express middleware
├── routes/              # API route definitions
├── uploads/             # File uploads directory
└── server.ts            # Application entry point
```

## 📚 API Endpoints

### Authentication

- `POST /api/users/login`: User login
- `POST /api/users/loginUserGodoc`: Application-specific login

### Document Workflow

#### Proposed Changes
- `GET /api/proposedchanges`: Get all proposed changes
- `POST /api/proposedchanges`: Create a new proposed change
- `PUT /api/proposedchanges/:id`: Update a proposed change
- `GET /api/proposedchanges/:id`: Get a specific proposed change
- `DELETE /api/proposedchanges/:id`: Delete a proposed change (soft delete)

#### Authorization Documents
- `GET /api/authdoc`: Get all authorization documents
- `POST /api/authdoc`: Create a new authorization document
- `GET /api/authdoc/:id`: Get a specific authorization document
- `PUT /api/authdoc/:id`: Update an authorization document
- `POST /api/authstatus`: Update authorization approval status

#### Handover Documents
- `GET /api/handover`: Get all handover documents
- `POST /api/handover`: Create a new handover document
- `GET /api/handover/:id`: Get a specific handover document
- `PUT /api/handover/:id`: Update a handover document
- `POST /api/approvalhandover`: Update handover approval status

### Support Documents and Files

- `GET /api/supportproposed/:id`: Get support documents for a proposed change
- `POST /api/uploadsupport/`: Upload a support document file
- `GET /api/support-docs/file/:id/download`: Download a support document file
- `GET /api/support-docs/file/:id/view`: View a support document file

### Master Data

- `GET /api/userGodoc`: Get all users/authorizations
- `GET /api/departments`: Get all departments
- `GET /api/sectiondepartments`: Get all section departments
- `GET /api/plants`: Get all plants
- `GET /api/lines`: Get all lines
- `GET /api/areas`: Get all areas

## 🔑 Authentication

The system uses JWT-based authentication. To access protected endpoints:

1. Obtain a token via the login endpoint
2. Include the token in the Authorization header of subsequent requests:

```
Authorization: Bearer YOUR_JWT_TOKEN
```

## 📧 Email Notification System

The application includes an idempotent email delivery system that ensures:

- Emails are sent only once for each unique action
- Proper tracking of email delivery status
- Support for different recipient types (submitter, approver, next approver)
- Customizable email templates for different document statuses

## 💾 Document Storage

Documents are stored in the `src/uploads` directory. The system supports:

- File versioning
- File viewing and downloading
- Watermarking of documents

## 📊 Workflow States

### Proposed Changes States
- `submitted`: Initially submitted for review
- `approved`: Approved by all required approvers
- `not_approved`: Not approved by at least one approver
- `rejected`: Rejected by at least one approver
- `done`: Completed and ready for next stage

### Authorization Document States
- `submitted`: Initially submitted for review
- `updated`: Document has been updated
- `approved`: Approved by all required approvers
- `not_approved`: Not approved by at least one approver
- `rejected`: Rejected by at least one approver
- `done`: Completed and ready for next stage

### Handover Document States
- `submitted`: Initially submitted for review
- `approved`: Approved by all required approvers
- `not_approved`: Not approved by at least one approver
- `rejected`: Rejected by at least one approver
- `onprogress`: In progress through the approval workflow

## 👥 Development Team

Maintained by the Go-Document System development team

## 📝 License

This project is proprietary and confidential. Unauthorized copying, distribution, or use is strictly prohibited.

---

## 🔍 Troubleshooting

### Common Issues

1. **Database Connection Errors**
   - Verify MySQL is running
   - Check database credentials in `.env` file
   - Ensure database schema matches Prisma schema

2. **Email Sending Issues**
   - Check email configuration
   - Verify SMTP server is accessible
   - Check for rate limiting or authentication issues

3. **File Upload Problems**
   - Ensure the uploads directory is writable
   - Check file size limits in configuration
   - Verify supported file types

### Logging

The application uses console logging with different log levels:
- ✅ Success messages
- ℹ️ Information messages
- ⚠️ Warning messages
- ❌ Error messages

Check server logs for detailed information about errors.

