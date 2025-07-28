import { Request, Response } from "express";
import { prismaDB2 } from "../../../config/database";

export const getAllSectionHeads = async (req: Request, res: Response): Promise<void> => {
    try {
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 10;
        const searchTerm = (req.query.search as string) || "";
        const status = req.query.status === "true";
        const sortColumn = (req.query.sort as string) || "id";
        const sortDirection = req.query.direction === "desc" ? "desc" : "asc";

        const validSortColumns = ["id", "id_authorization", "id_section_department", "status", "created_by"];

        const orderBy: any = validSortColumns.includes(sortColumn)
            ? { [sortColumn]: sortDirection }
            : { id: "asc" };

        const offset = (page - 1) * limit;

        const whereCondition: any = {
            is_deleted: false,
            AND: []
        };

        if (searchTerm) {
            whereCondition.OR = [
                { created_by: { contains: searchTerm, mode: "insensitive" } },
                { authorization: { employee_code: { contains: searchTerm, mode: "insensitive" } } },
                { authorization: { employee_name: { contains: searchTerm, mode: "insensitive" } } },
                { section: { section_name: { contains: searchTerm, mode: "insensitive" } } },
                { section: { department: { department_name: { contains: searchTerm, mode: "insensitive" } } } }
            ];
        }

        if (req.query.status !== undefined) {
            whereCondition.authorization = { status };
        }

        const [sectionHeads, totalCount] = await prismaDB2.$transaction([
            prismaDB2.mst_section_head.findMany({
                where: whereCondition,
                skip: offset,
                take: limit,
                orderBy,
                include: {
                    authorization: {
                        select: {
                            id: true,
                            employee_code: true,
                            employee_name: true,
                            status: true // Status authorization ditampilkan
                        }
                    },
                    section: {
                        select: {
                            id: true,
                            department_id: true,
                            section_name: true,
                            department: {
                                select: {
                                    department_name: true
                                }
                            }
                        }
                    }
                }
            }),
            prismaDB2.mst_section_head.count({ where: whereCondition }),
        ]);

        const totalPages = Math.ceil(totalCount / limit);
        const hasNextPage = page < totalPages;
        const hasPreviousPage = page > 1;

        res.status(200).json({
            data: sectionHeads.map(sectionHead => ({
                id: sectionHead.id,
                id_authorization: sectionHead.authorization?.id ?? null,
                employee_code: sectionHead.authorization?.employee_code ?? null,
                employee_name: sectionHead.authorization?.employee_name ?? null,
                authorization_status: sectionHead.authorization?.status ?? null, // Status authorization ditambahkan
                id_section_department: sectionHead.section?.id ?? null,
                department_id: sectionHead.section?.department_id ?? null,
                department_name: sectionHead.section?.department?.department_name ?? null,
                section_name: sectionHead.section?.section_name ?? null,
                created_by: sectionHead.created_by,
                is_deleted: sectionHead.is_deleted
            })),
            pagination: {
                totalCount,
                totalPages,
                currentPage: page,
                limit,
                hasNextPage,
                hasPreviousPage
            },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

export const getAllSectionHeadsbyID = async (req: Request, res: Response): Promise<void> => {
    try {
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 10;
        const idSearchTerm = req.params.id as string; // Parameter pencarian khusus ID
        const status = req.query.status === "true";
        const sortColumn = (req.query.sort as string) || "id";
        const sortDirection = req.query.direction === "desc" ? "desc" : "asc";

        const validSortColumns = ["id", "id_authorization", "id_section_department", "status", "created_by"];

        const orderBy: any = validSortColumns.includes(sortColumn)
            ? { [sortColumn]: sortDirection }
            : { id: "asc" };

        const offset = (page - 1) * limit;

        const whereCondition: any = {
            is_deleted: false,
        };

        if (idSearchTerm) {
            // Hanya mencari berdasarkan ID jika tersedia
            whereCondition.id = Number(idSearchTerm) || 0;
        } else {
            res.status(400).json({ error: "ID is required for search" });
            return;
        }

        if (req.query.status !== undefined) {
            whereCondition.authorization = { status };
        }

        const [sectionHeads, totalCount] = await prismaDB2.$transaction([
            prismaDB2.mst_section_head.findMany({
                where: whereCondition,
                skip: offset,
                take: limit,
                orderBy,
                include: {
                    authorization: {
                        select: {
                            id: true,
                            employee_code: true,
                            employee_name: true,
                            status: true // Status authorization ditampilkan
                        }
                    },
                    section: {
                        select: {
                            id: true,
                            department_id: true,
                            section_name: true,
                            department: {
                                select: {
                                    department_name: true
                                }
                            }
                        }
                    }
                }
            }),
            prismaDB2.mst_section_head.count({ where: whereCondition }),
        ]);

        const totalPages = Math.ceil(totalCount / limit);
        const hasNextPage = page < totalPages;
        const hasPreviousPage = page > 1;

        res.status(200).json({
            data: sectionHeads.map(sectionHead => ({
                id: sectionHead.id,
                id_authorization: sectionHead.authorization?.id ?? null,
                employee_code: sectionHead.authorization?.employee_code ?? null,
                employee_name: sectionHead.authorization?.employee_name ?? null,
                authorization_status: sectionHead.authorization?.status ?? null, // Status authorization ditambahkan
                id_section_department: sectionHead.section?.id ?? null,
                department_id: sectionHead.section?.department_id ?? null,
                department_name: sectionHead.section?.department?.department_name ?? null,
                section_name: sectionHead.section?.section_name ?? null,
                created_by: sectionHead.created_by,
                is_deleted: sectionHead.is_deleted
            })),
            pagination: {
                totalCount,
                totalPages,
                currentPage: page,
                limit,
                hasNextPage,
                hasPreviousPage
            },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};


export const createSectionHead = async (req: Request, res: Response): Promise<void> => {
    try {
        console.log("Received request body:", req.body);

        const { authorization_id, section_id, created_by } = req.body;

        // Validasi input
        if (!authorization_id) {
            res.status(400).json({ error: "authorization_id harus diisi." });
            return;
        }

        if (!section_id) {
            res.status(400).json({ error: "section_id harus diisi." });
            return;
        }

        // Cek apakah `authorization_id` ada di `mst_authorization`
        const authorization = await prismaDB2.mst_authorization.findUnique({
            where: { id: authorization_id }
        });

        if (!authorization) {
            res.status(404).json({ error: `Authorization dengan ID ${authorization_id} tidak ditemukan.` });
            return;
        }

        // Cek apakah `section_id` ada di `mst_section_department`
        const section = await prismaDB2.mst_section_department.findUnique({
            where: { id: section_id }
        });

        if (!section) {
            res.status(404).json({ error: `Section dengan ID ${section_id} tidak ditemukan.` });
            return;
        }

        // Cek apakah kombinasi `authorization_id` dan `section_id` sudah ada di `mst_section_head`
        const existingSectionHead = await prismaDB2.mst_section_head.findFirst({
            where: { authorization_id, section_id }
        });

        if (existingSectionHead) {
            if (existingSectionHead.is_deleted) {
                // Jika sudah ada tetapi is_deleted = true, maka update jadi false
                const restoredSectionHead = await prismaDB2.mst_section_head.update({
                    where: { id: existingSectionHead.id },
                    data: { is_deleted: false, created_by }
                });

                res.status(200).json({
                    message: "Section Head sebelumnya ditemukan dalam kondisi terhapus. Data telah dipulihkan.",
                    data: restoredSectionHead
                });
                return;
            }

            res.status(400).json({
                error: `Section Head dengan authorization ID ${authorization_id} dan section ID ${section_id} sudah ada.`
            });
            return;
        }

        // Simpan data baru ke `mst_section_head`
        const newSectionHead = await prismaDB2.mst_section_head.create({
            data: {
                authorization_id,
                section_id,
                created_by,
                is_deleted: false // Default is_deleted = false
            },
            include: {
                authorization: {
                    select: {
                        employee_code: true,
                        employee_name: true,
                        status: true
                    }
                },
                section: {
                    select: {
                        department_id: true,
                        section_name: true
                    }
                }
            }
        });

        res.status(201).json({
            message: "Data Section Head berhasil ditambahkan",
            data: newSectionHead
        });

    } catch (error) {
        console.error("Error creating Section Head:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};


export const softDeleteSectionHead = async (req: Request, res: Response): Promise<void> => {
    try {
        const id = Number(req.params.id);

        if (isNaN(id)) {
            res.status(400).json({ error: "Invalid ID" });
            return;
        }

        // Cek apakah data dengan ID tersebut ada
        const existingData = await prismaDB2.mst_section_head.findUnique({
            where: { id }
        });

        if (!existingData) {
            res.status(404).json({ error: "Section Head not found" });
            return;
        }

        // Update is_deleted menjadi true
        await prismaDB2.mst_section_head.update({
            where: { id },
            data: { is_deleted: true }
        });

        res.status(200).json({ message: "Section Head successfully soft deleted" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

export const updateSectionHead = async (req: Request, res: Response): Promise<void> => {
    try {
        const id = Number(req.params.id);
        const { authorization_id, section_id, created_by, is_deleted } = req.body;

        if (isNaN(id)) {
            res.status(400).json({ error: "Invalid ID" });
            return;
        }

        // Cek apakah data dengan ID tersebut ada
        const existingData = await prismaDB2.mst_section_head.findUnique({
            where: { id }
        });

        if (!existingData) {
            res.status(404).json({ error: "Section Head not found" });
            return;
        }

        const updateData: any = {};

        if (authorization_id) {
            updateData.authorization_id = authorization_id;
        }

        if (section_id) {
            // Cek apakah `section_id` sudah digunakan oleh Section Head lain
            const duplicateSectionHead = await prismaDB2.mst_section_head.findFirst({
                where: {
                    section_id,
                    is_deleted: false,
                    NOT: { id } // Hindari cek terhadap dirinya sendiri
                }
            });

            if (duplicateSectionHead) {
                res.status(400).json({ error: `Section ID ${section_id} sudah digunakan oleh Section Head lain.` });
                return;
            }

            updateData.section_id = section_id;
        }

        if (created_by) {
            updateData.created_by = created_by;
        }

        if (is_deleted !== undefined) {
            updateData.is_deleted = is_deleted;
        }

        // Lakukan update hanya jika ada data yang perlu diubah
        if (Object.keys(updateData).length === 0) {
            res.status(400).json({ error: "Tidak ada data yang diperbarui." });
            return;
        }

        const updatedSectionHead = await prismaDB2.mst_section_head.update({
            where: { id },
            data: updateData
        });

        res.status(200).json({
            message: "Data Section Head berhasil diperbarui",
            data: updatedSectionHead
        });

    } catch (error) {
        console.error("Error updating Section Head:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};
