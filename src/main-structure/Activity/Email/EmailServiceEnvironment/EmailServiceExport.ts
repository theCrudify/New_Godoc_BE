import nodemailer from 'nodemailer';
import { prismaDB2 } from "../../../../config/database";


// Definisi tipe untuk parameter email
interface EmailOptions {
    to: string;
    subject: string;
    html: string;
    cc?: string;
}

// Fungsi untuk mengirim email
const sendEmail = async ({ to, subject, html, cc = '' }: EmailOptions) => {
    try {
        // Tambahkan timestamp untuk memastikan uniqueness
        const timestamp = new Date().getTime();
        
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
            },
            debug: false, // Ubah menjadi false kecuali untuk debugging
        });

        // Tambahkan nomor acak ke subject untuk menghindari grouping
        const uniqueSubject = `${subject} [${timestamp.toString().substring(8)}]`;

        // Konfigurasi email
        const mailOptions: any = {
            from: '"Go-Document System" <appsskb@aio.co.id>',
            to,
            subject: uniqueSubject,
            html,
        };

        // Tambahkan CC jika ada
        if (cc) {
            mailOptions.cc = cc;
        }

        // Tambahkan header Message-ID unik dan timestamp
        mailOptions.messageId = `<${timestamp}-${Math.random().toString(36).substring(2, 15)}@aio.co.id>`;
        
        // Header tambahan untuk mencegah threading/grouping
        mailOptions.headers = {
            'X-Entity-Ref-ID': `${timestamp}-${Math.random().toString(36).substring(2, 10)}`,
            'X-Unique-ID': `${Date.now()}`
        };

        // Kirim email
        const info = await transport.sendMail(mailOptions);

        console.log(`Email sent successfully to ${to}${cc ? ` with cc to ${cc}` : ''}, messageId: ${info.messageId}`);
        return info;
    } catch (error) {
        console.error(`Error sending email to ${to}:`, error);
        throw error; // Re-throw error untuk penanganan lebih lanjut
    }
};

// Mendapatkan salam berdasarkan waktu saat ini
const getGreeting = (): string => {
    const hour = new Date().getHours();

    if (hour >= 5 && hour < 12) {
        return "Selamat Pagi";
    } else if (hour >= 12 && hour < 15) {
        return "Selamat Siang";
    } else if (hour >= 15 && hour < 19) {
        return "Selamat Sore";
    } else {
        return "Selamat Malam";
    }
};

// Mendapatkan informasi running number dari dokumen
const getDocumentNumber = async (proposedChangesId: number): Promise<string> => {
    try {
        const proposedChange = await prismaDB2.tr_proposed_changes.findUnique({
            where: { id: proposedChangesId },
            include: {
                documentNumber: true
            }
        });

        if (!proposedChange || !proposedChange.documentNumber) {
            return "N/A";
        }

        return proposedChange.documentNumber.running_number || "N/A";
    } catch (error) {
        console.error("Error fetching document number:", error);
        return "N/A";
    }
};

// Mendapatkan gender title (Bapak/Ibu)
const getGenderTitle = (gender?: 'M' | 'F' | null): string => {
  return gender === 'F' ? 'Ibu' : 'Bapak';
};


// Mendapatkan format status untuk notifikasi
const getStatusText = (status: string): string => {
    switch (status) {
        case 'approved':
            return 'DISETUJUI';
        case 'not_approved':
            return 'TIDAK DISETUJUI';
        case 'rejected':
            return 'DITOLAK';
        case 'on_going':
            return 'SEDANG DIPROSES';
        default:
            return status.toUpperCase();
    }
};


export {  getStatusText, sendEmail, getDocumentNumber, getGenderTitle, getGreeting  };