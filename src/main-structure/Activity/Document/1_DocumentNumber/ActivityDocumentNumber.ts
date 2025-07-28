import { Request, Response } from "express";
import { prismaDB2 } from "../../../../config/database";

// --- Helper Functions ---

// Fungsi validasi input untuk tr_document_number

interface DocumentWhereCondition {
    AND?: Array<Record<string, any>>;
    OR?: Array<Record<string, any>>;
}

// --- CRUD Functions ---

// Get all document numbers


// Fungsi ini akan mengembalikan semua nomor dokumen yang ada di database
// Fungsi ini juga mendukung pagination dan pencarian berdasarkan beberapa field
// Fungsi ini akan mengembalikan data dalam format JSON
// Fungsi ini juga akan mengembalikan informasi pagination seperti totalCount, totalPages, currentPage, limit, hasNextPage, dan hasPreviousPage
// Fungsi ini juga akan mengembalikan data dalam format JSON
// Fungsi ini juga akan mengembalikan informasi pagination seperti totalCount, totalPages, currentPage, limit, hasNextPage, dan hasPreviousPage
export const getAllDocumentNumbers = async (req: Request, res: Response): Promise<void> => {
    try {
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 10;
        const searchTerm = (req.query.search as string) || "";
        const authId = req.query.auth_id as string;
        const offset = (page - 1) * limit;

        const whereCondition: any = {
            klasifikasi_document: "UP",
            NOT: {
                id: {
                    in: (
                        await prismaDB2.tr_proposed_changes.findMany({
                            select: { document_number_id: true },
                            distinct: ["document_number_id"],
                            where: {
                                document_number_id: {
                                    not: null
                                }
                            }
                        })
                    ).map(pc => pc.document_number_id)
                }
            }
        };

        // ✅ Gunakan relasi authorization, bukan field langsung
        if (authId) {
            whereCondition.authorization = {
                id: Number(authId)
            };
        }

        // ✅ Tambahkan pencarian jika ada
        if (searchTerm) {
            whereCondition.OR = [
                { running_number: { contains: searchTerm } },
                { klasifikasi_document: { contains: searchTerm } },
                { line_code: { contains: searchTerm } },
                { section_code: { contains: searchTerm } },
                { department_code: { contains: searchTerm } },
                { development_code: { contains: searchTerm } },
                { created_by: { contains: searchTerm } }
            ];
        }

        const [documentNumbers, totalCount] = await prismaDB2.$transaction([
            prismaDB2.tr_document_number.findMany({
                where: whereCondition,
                skip: offset,
                take: limit,
                orderBy: {
                    created_date: "desc"
                },
                include: {
                    category: true,
                    plant: true,
                    area: {
                        include: {
                            line: true
                        }
                    },
                    section: true,
                    authorization: true
                }
            }),
            prismaDB2.tr_document_number.count({
                where: whereCondition
            })
        ]);

        const totalPages = Math.ceil(totalCount / limit);
        const hasNextPage = page < totalPages;
        const hasPreviousPage = page > 1;

        res.status(200).json({
            data: documentNumbers,
            pagination: {
                totalCount,
                totalPages,
                currentPage: page,
                limit,
                hasNextPage,
                hasPreviousPage
            }
        });

    } catch (error: any) {
        console.error("❌ Error in getAllDocumentNumbers:", error);
        res.status(500).json({
            error: "Internal Server Error",
            details: process.env.NODE_ENV === "development" ? error.message : undefined
        });
    }
};

// Fungsi untuk mendapatkan nomor dokumen berdasarkan ID
// Fungsi ini akan mengembalikan data dokumen berdasarkan ID yang diberikan
// Jika ID tidak valid, fungsi ini akan mengembalikan pesan kesalahan
// Jika dokumen tidak ditemukan, fungsi ini akan mengembalikan pesan kesalahan
// Jika dokumen ditemukan, fungsi ini akan mengembalikan data dokumen yang ditemukan
export const getDocumentNumberById = async (req: Request, res: Response): Promise<void> => {
    try {
        // 1. Ambil ID dari parameter URL
        const id = Number(req.params.id);

        // 2. Validasi ID
        if (isNaN(id)) {
            res.status(400).json({ error: "Invalid ID" });
            return;
        }

        // 3. Ambil data dokumen dari database menggunakan Prisma
        const document = await prismaDB2.tr_document_number.findUnique({
            where: { id: id },
            include: {
                plant: true,
                area: {
                    include: {
                        line: true,
                    },
                },
                category: true, // Sertakan data dari mst_document_categories
            },
        });

        // 4. Periksa apakah dokumen ditemukan
        if (!document) {
            res.status(404).json({ error: "Document not found" });
            return;
        }

        // 5. Format data respons
        const formattedDocument = {
            ...document,
            plant: document.plant,
            area: document.area
                ? {
                    ...document.area,
                    line: document.area.line,
                }
                : null,
            category: document.category // Sertakan data kategori dari mst_document_categories
                ? {
                    id: document.category.id,
                    category: document.category.category,
                }
                : null,
        };

        // 6. Kirim respons sukses dengan data dokumen yang diformat
        res.status(200).json({ data: [formattedDocument] });

    } catch (error) {
        // 7. Tangani error jika terjadi
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};


// Fungsi untuk memvalidasi data input
// Fungsi ini akan memeriksa apakah semua field yang diperlukan ada dan tidak kosong
// Jika ada field yang kosong, fungsi ini akan mengembalikan array berisi pesan kesalahan
// Jika semua field valid, fungsi ini akan mengembalikan array kosong
function validateAreaData(data: any): string[] {
    const errors: string[] = [];
    if (!data.klasifikasi_document) errors.push("Klasifikasi Document is required.");
    if (!data.line_code) errors.push("Line Code is required.");
    if (!data.section_code) errors.push("Section Code is required.");
    if (!data.department_code) errors.push("Department Code is required.");
    if (!data.development_code) errors.push("Development Code is required.");
    if (!data.plant_id) errors.push("Plant ID is required.");
    if (!data.created_date) errors.push("Created Date is required.");
    if (!data.area_id) errors.push("Area ID is required.");
    return errors;
}

// Create Document Number
// Fungsi untuk membuat nomor dokumen baru
export const createDocumentNumber = async (req: Request, res: Response): Promise<void> => {
    try {
        const data = req.body;

        const errors = validateAreaData(data);
        if (errors.length > 0) {
            res.status(400).json({ error: "Validation Error", details: errors });
            return;
        }

        let klasifikasiCodeToUse = data.klasifikasi_document;
        if (klasifikasiCodeToUse === 'Usulan Perubahan (UP)') {
            klasifikasiCodeToUse = 'UP';
        }

        // 1️⃣ Cek field yang kosong
        const requiredFields = [
            "line_code", "section_code", "department_code", "development_code",
            "category_id", "section_id",
            "plant_id", "area_id", "created_by",
            "auth_id" // Tambahkan di sini
        ];

        const missingFields = requiredFields.filter(field => !data[field]);

        if (missingFields.length > 0) {
            console.log(`❌ ERROR: Missing required fields: ${missingFields.join(", ")}`);
            res.status(400).json({
                error: "Validation Error",
                details: `Missing fields: ${missingFields.join(", ")}`
            });
            return;
        }

        // 2️⃣ Ambil nomor urut terakhir
        const lastGlobalDocument = await prismaDB2.tr_document_number.findFirst({
            orderBy: { running_number: 'desc' },
            select: { running_number: true },
        });

        let globalSequenceNumber = 1;
        if (lastGlobalDocument?.running_number) {
            const parts = lastGlobalDocument.running_number.split('/');
            if (parts.length > 0) {
                const lastSequence = parseInt(parts[0]);
                if (!isNaN(lastSequence)) {
                    globalSequenceNumber = lastSequence + 1;
                }
            }
        }

        // 3️⃣ Ambil nomor urut section terakhir
        const lastDocumentSection = await prismaDB2.tr_document_number.findFirst({
            where: {
                line_code: data.line_code,
                section_code: data.section_code,
                plant_id: data.plant_id,
                area_id: data.area_id,
            },
            orderBy: { running_number: 'desc' },
            select: { running_number: true },
        });

        let sectionSequence = 1;
        if (lastDocumentSection?.running_number) {
            const parts = lastDocumentSection.running_number.split('/');
            if (parts.length > 2) {
                const sectionPart = parts[2].split('-');
                if (sectionPart.length > 1) {
                    const lastSectionSequence = parseInt(sectionPart[1]);
                    if (!isNaN(lastSectionSequence)) {
                        sectionSequence = lastSectionSequence + 1;
                    }
                }
            }
        }

        // 4️⃣ Format nomor urut
        const formattedSequence = String(globalSequenceNumber).padStart(2, '0');
        const formattedSectionSequence = String(sectionSequence).padStart(2, '0');
        const year = new Date(data.created_date || Date.now()).getFullYear().toString().slice(-2);

        const runningNumber = `${formattedSequence}/${data.line_code}/${data.section_code}-${formattedSectionSequence}/${klasifikasiCodeToUse}/${data.department_code}/${data.development_code}/${year}`;

        // 5️⃣ Simpan ke database
        const newDocument = await prismaDB2.tr_document_number.create({
            data: {
                running_number: runningNumber,
                category_id: data.category_id,
                klasifikasi_document: klasifikasiCodeToUse,
                line_code: data.line_code,
                section_code: data.section_code,
                department_code: data.department_code,
                development_code: data.development_code,
                id_proposed_header: data.id_proposed_header,
                sub_document: data.sub_document,
                section_id: data.section_id,
                plant_id: data.plant_id,
                is_internal_memo: data.is_internal_memo,
                is_surat_ketentuan: data.is_surat_ketentuan,
                created_by: data.created_by,
                created_date: data.created_date ? new Date(data.created_date) : new Date(),
                area_id: data.area_id,
                auth_id: data.auth_id // Tambahkan di sini
            },
        });

        console.log(`✅ SUCCESS: Document number ${runningNumber} created!`);
        res.status(201).json({ message: "Document number created successfully", data: newDocument });
    } catch (error) {
        console.error("❌ ERROR: Failed to create document number:", error);
        if (error instanceof Error) {
            res.status(500).json({ error: "Internal Server Error", details: error.message });
        } else {
            res.status(500).json({ error: "Internal Server Error", details: "An unknown error occurred" });
        }
    }
};


//Delete Document Number
// Fungsi untuk menghapus nomor dokumen berdasarkan ID
// Fungsi ini akan menghapus nomor dokumen dari database berdasarkan ID yang diberikan
// Jika ID tidak valid, fungsi ini akan mengembalikan pesan kesalahan
export const deleteDocumentNumberById = async (req: Request, res: Response): Promise<void> => {
    try {
        // 1. Ambil ID dari parameter URL
        const id = Number(req.params.id);

        // 2. Validasi ID
        if (isNaN(id)) {
            res.status(400).json({ error: "Invalid ID" });
            return;
        }

        // 3. Cek apakah dokumen dengan ID tersebut ada
        const document = await prismaDB2.tr_document_number.findUnique({
            where: { id: id }
        });

        if (!document) {
            res.status(404).json({ error: "Document not found" });
            return;
        }

        // 4. Hapus dokumen dari database
        await prismaDB2.tr_document_number.delete({
            where: { id: id }
        });

        // 5. Kirim respons sukses
        res.status(200).json({ message: "Document successfully deleted" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};
