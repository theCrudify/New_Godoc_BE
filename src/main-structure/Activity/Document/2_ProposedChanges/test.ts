import { prismaDB2 } from "../../../../config/database";

// Define a common include structure for consistency
const commonInclude = {
  authorization: {
    select: {
      id: true,
      employee_code: true,
      employee_name: true,
      status: true
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
};

// More specific type for the model parameter
type PrismaHeadModel = typeof prismaDB2.mst_section_head | typeof prismaDB2.mst_department_head;

// Interface for stronger typing of head data
interface HeadData {
  id: number;
  id_authorization: number | null;
  employee_code: string | null;
  employee_name: string | null;
  authorization_status: boolean | null;
  section_id: number | null;
  department_id: number | null;
  department_name: string | null;
  section_name: string | null;
  directorship: string;
  created_by: string | null;
  is_deleted: boolean;
}

// Define the fetch configuration for cleaner code
interface FetchConfig {
  model: PrismaHeadModel;
  sectionId: number;
  directorship: string;
}

/**
 * Improved function to fetch head data based on section ID and directorship label.
 * @param model - The Prisma model to query
 * @param sectionId - The section ID to filter by
 * @param directorship - The string label for the 'directorship' field in the output
 * @returns Promise<HeadData[] | null>
 */
async function fetchHeadData(
  model: PrismaHeadModel,
  sectionId: number,
  directorship: string
): Promise<HeadData[] | null> {
  try {
    if (!sectionId || isNaN(Number(sectionId))) {
      console.error(`Invalid section ID provided: ${sectionId}`);
      return null;
    }

    const results = await (model === prismaDB2.mst_section_head
      ? prismaDB2.mst_section_head.findMany({
        where: {
          is_deleted: false,
          section_id: Number(sectionId)
        },
        include: commonInclude
      })
      : prismaDB2.mst_department_head.findMany({
        where: {
          is_deleted: false,
          section_id: Number(sectionId)
        },
        include: commonInclude
      }));

    return results.map(item => ({
      id: item.id,
      id_authorization: item.authorization?.id ?? null,
      employee_code: item.authorization?.employee_code ?? null,
      employee_name: item.authorization?.employee_name ?? null,
      authorization_status: item.authorization?.status ?? null,
      section_id: item.section?.id ?? null,
      department_id: item.section?.department_id ?? null,
      department_name: item.section?.department?.department_name ?? null,
      section_name: item.section?.section_name ?? null,
      directorship,
      created_by: item.created_by ?? null,
      is_deleted: item.is_deleted ?? false
    }));
  } catch (error) {
    console.error(`Error fetching ${directorship} for section ID ${sectionId}:`, error);
    return null;
  }
}

/**
 * Main function to fetch and combine all head data without duplicates.
 */
// async function getAllHeadsData(): Promise<{ data: HeadData[] }> {
//   const fetchConfigs: FetchConfig[] = [
//     { model: prismaDB2.mst_section_head, sectionId: , directorship: 'Section Head' },
//     { model: prismaDB2.mst_department_head, sectionId: , directorship: 'Department Head' },
//     { model: prismaDB2.mst_department_head, sectionId: 15, directorship: 'Engineering Head' },
//     { model: prismaDB2.mst_department_head, sectionId: 15, directorship: 'Engineering Head' },
//     { model: prismaDB2.mst_section_head, sectionId: , directorship: 'Section Head of Line' },

//     { model: prismaDB2.mst_department_head, sectionId: 1, directorship: 'Technical Head' },
//     { model: prismaDB2.mst_section_head, sectionId: 13, directorship: 'QA Compliance' }
//     { model: prismaDB2.mst_department_head, sectionId: 11, directorship: 'Quality Assurance Head' },
//     { model: prismaDB2.mst_department_head, sectionId: 10, directorship: 'Head of Manufacture' },
//     { model: prismaDB2.mst_department_head, sectionId: 17, directorship: 'Head of Corporate Quality' },
//   ];

//   try {
//     const results = await Promise.all(
//       fetchConfigs.map(config =>
//         fetchHeadData(config.model, config.sectionId, config.directorship)
//       )
//     );

//     const seenEmployeeCodes = new Set<string>();
//     const uniqueHeads: HeadData[] = [];

//     results
//       .filter((result): result is HeadData[] => result !== null)
//       .flat()
//       .forEach(head => {
//         const code = head.employee_code;
//         if (code && !seenEmployeeCodes.has(code)) {
//           seenEmployeeCodes.add(code);
//           uniqueHeads.push(head);
//         }
//       });

//     return { data: uniqueHeads };
//   } catch (error) {
//     console.error("Error fetching head data:", error);
//     return { data: [] };
//   } finally {
//     await prismaDB2.$disconnect();
//   }
// }

// // Export the function for use in other modules
// export { getAllHeadsData };

// // Execute if this file is run directly
// if (require.main === module) {
//   getAllHeadsData()
//     .then(result => console.log(JSON.stringify(result, null, 2)))
//     .catch(err => console.error("Execution error:", err));
// }
