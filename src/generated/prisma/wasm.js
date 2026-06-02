
Object.defineProperty(exports, "__esModule", { value: true });

const {
  Decimal,
  objectEnumValues,
  makeStrictEnum,
  Public,
  getRuntime,
  skip
} = require('./runtime/index-browser.js')


const Prisma = {}

exports.Prisma = Prisma
exports.$Enums = {}

/**
 * Prisma Client JS version: 5.22.0
 * Query Engine version: 605197351a3c8bdd595af2d2a9bc3025bca48ea2
 */
Prisma.prismaVersion = {
  client: "5.22.0",
  engine: "605197351a3c8bdd595af2d2a9bc3025bca48ea2"
}

Prisma.PrismaClientKnownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientKnownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)};
Prisma.PrismaClientUnknownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientUnknownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientRustPanicError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientRustPanicError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientInitializationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientInitializationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientValidationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientValidationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.NotFoundError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`NotFoundError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.Decimal = Decimal

/**
 * Re-export of sql-template-tag
 */
Prisma.sql = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`sqltag is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.empty = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`empty is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.join = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`join is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.raw = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`raw is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.validator = Public.validator

/**
* Extensions
*/
Prisma.getExtensionContext = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.getExtensionContext is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.defineExtension = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.defineExtension is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}

/**
 * Shorthand utilities for JSON filtering
 */
Prisma.DbNull = objectEnumValues.instances.DbNull
Prisma.JsonNull = objectEnumValues.instances.JsonNull
Prisma.AnyNull = objectEnumValues.instances.AnyNull

Prisma.NullTypes = {
  DbNull: objectEnumValues.classes.DbNull,
  JsonNull: objectEnumValues.classes.JsonNull,
  AnyNull: objectEnumValues.classes.AnyNull
}



/**
 * Enums
 */

exports.Prisma.TransactionIsolationLevel = makeStrictEnum({
  ReadUncommitted: 'ReadUncommitted',
  ReadCommitted: 'ReadCommitted',
  RepeatableRead: 'RepeatableRead',
  Serializable: 'Serializable'
});

exports.Prisma.UserScalarFieldEnum = {
  id: 'id',
  name: 'name',
  email: 'email',
  password: 'password',
  role: 'role',
  department: 'department',
  active: 'active',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.FormScalarFieldEnum = {
  id: 'id',
  title: 'title',
  description: 'description',
  category: 'category',
  fields: 'fields',
  active: 'active',
  version: 'version',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  createdById: 'createdById'
};

exports.Prisma.FormSubmissionScalarFieldEnum = {
  id: 'id',
  formId: 'formId',
  data: 'data',
  status: 'status',
  notes: 'notes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  submittedById: 'submittedById',
  approvedById: 'approvedById',
  taskId: 'taskId'
};

exports.Prisma.TaskScalarFieldEnum = {
  id: 'id',
  title: 'title',
  description: 'description',
  status: 'status',
  priority: 'priority',
  dueDate: 'dueDate',
  completedAt: 'completedAt',
  recurrence: 'recurrence',
  location: 'location',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  formId: 'formId',
  assignedToId: 'assignedToId',
  createdById: 'createdById'
};

exports.Prisma.RecordScalarFieldEnum = {
  id: 'id',
  title: 'title',
  type: 'type',
  description: 'description',
  data: 'data',
  tags: 'tags',
  archived: 'archived',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  createdById: 'createdById'
};

exports.Prisma.PreOpInspectionScalarFieldEnum = {
  id: 'id',
  date: 'date',
  shift: 'shift',
  status: 'status',
  sections: 'sections',
  correctiveAction: 'correctiveAction',
  supervisorSignature: 'supervisorSignature',
  submittedAt: 'submittedAt',
  submittedById: 'submittedById'
};

exports.Prisma.BatchSheetTemplateScalarFieldEnum = {
  id: 'id',
  name: 'name',
  description: 'description',
  category: 'category',
  isActive: 'isActive',
  ingredients: 'ingredients',
  packaging: 'packaging',
  ovensAvailable: 'ovensAvailable',
  calibrationWeights: 'calibrationWeights',
  ccpSettings: 'ccpSettings',
  ccpNumSessions: 'ccpNumSessions',
  ccpRequireTimestamp: 'ccpRequireTimestamp',
  endOfProductionFields: 'endOfProductionFields',
  primaryUnitName: 'primaryUnitName',
  hasInternalUnits: 'hasInternalUnits',
  internalUnitName: 'internalUnitName',
  internalUnitsPerPrimary: 'internalUnitsPerPrimary',
  declaredAllergens: 'declaredAllergens',
  hasExpirationDate: 'hasExpirationDate',
  releaseChecklistItems: 'releaseChecklistItems',
  createdById: 'createdById',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.BatchSheetSubmissionScalarFieldEnum = {
  id: 'id',
  templateId: 'templateId',
  templateName: 'templateName',
  productionDate: 'productionDate',
  productionLot: 'productionLot',
  expirationDate: 'expirationDate',
  shift: 'shift',
  supervisorName: 'supervisorName',
  numEmployees: 'numEmployees',
  status: 'status',
  section1: 'section1',
  section2_allergen: 'section2_allergen',
  section3: 'section3',
  section4: 'section4',
  section5: 'section5',
  section6: 'section6',
  notes: 'notes',
  lastSavedAt: 'lastSavedAt',
  lastActiveSection: 'lastActiveSection',
  submittedAt: 'submittedAt',
  submittedById: 'submittedById'
};

exports.Prisma.MaterialScalarFieldEnum = {
  id: 'id',
  name: 'name',
  description: 'description',
  category: 'category',
  unit: 'unit',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SupplierScalarFieldEnum = {
  id: 'id',
  name: 'name',
  contactName: 'contactName',
  email: 'email',
  phone: 'phone',
  address: 'address',
  notes: 'notes',
  status: 'status',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SupplierMaterialScalarFieldEnum = {
  id: 'id',
  supplierId: 'supplierId',
  materialId: 'materialId',
  createdAt: 'createdAt'
};

exports.Prisma.DocumentRequirementScalarFieldEnum = {
  id: 'id',
  name: 'name',
  description: 'description',
  requirementType: 'requirementType',
  isRequired: 'isRequired',
  isActive: 'isActive',
  sortOrder: 'sortOrder',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SupplierDocumentScalarFieldEnum = {
  id: 'id',
  supplierId: 'supplierId',
  requirementId: 'requirementId',
  fileName: 'fileName',
  fileUrl: 'fileUrl',
  fileSize: 'fileSize',
  mimeType: 'mimeType',
  expiresAt: 'expiresAt',
  uploadedAt: 'uploadedAt',
  notes: 'notes'
};

exports.Prisma.SupplierStatusLogScalarFieldEnum = {
  id: 'id',
  supplierId: 'supplierId',
  status: 'status',
  reason: 'reason',
  createdAt: 'createdAt'
};

exports.Prisma.AuditLogScalarFieldEnum = {
  id: 'id',
  action: 'action',
  entity: 'entity',
  entityId: 'entityId',
  userId: 'userId',
  userName: 'userName',
  details: 'details',
  createdAt: 'createdAt'
};

exports.Prisma.SortOrder = {
  asc: 'asc',
  desc: 'desc'
};

exports.Prisma.JsonNullValueInput = {
  JsonNull: Prisma.JsonNull
};

exports.Prisma.NullableJsonNullValueInput = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull
};

exports.Prisma.QueryMode = {
  default: 'default',
  insensitive: 'insensitive'
};

exports.Prisma.NullsOrder = {
  first: 'first',
  last: 'last'
};

exports.Prisma.JsonNullValueFilter = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull,
  AnyNull: Prisma.AnyNull
};
exports.Role = exports.$Enums.Role = {
  SUPERVISOR: 'SUPERVISOR',
  ADMIN: 'ADMIN'
};

exports.SubmissionStatus = exports.$Enums.SubmissionStatus = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED'
};

exports.TaskStatus = exports.$Enums.TaskStatus = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  OVERDUE: 'OVERDUE',
  CANCELLED: 'CANCELLED'
};

exports.TaskPriority = exports.$Enums.TaskPriority = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
};

exports.RecurrenceType = exports.$Enums.RecurrenceType = {
  NONE: 'NONE',
  DAILY: 'DAILY',
  WEEKLY: 'WEEKLY',
  MONTHLY: 'MONTHLY'
};

exports.PreOpShift = exports.$Enums.PreOpShift = {
  AM: 'AM',
  PM: 'PM'
};

exports.PreOpStatus = exports.$Enums.PreOpStatus = {
  PASS: 'PASS',
  FAIL: 'FAIL',
  PASS_WITH_ISSUES: 'PASS_WITH_ISSUES'
};

exports.BatchSheetStatus = exports.$Enums.BatchSheetStatus = {
  DRAFT: 'DRAFT',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETE: 'COMPLETE',
  PASS: 'PASS',
  FAIL: 'FAIL',
  PASS_WITH_ISSUES: 'PASS_WITH_ISSUES'
};

exports.MaterialCategory = exports.$Enums.MaterialCategory = {
  INGREDIENT: 'INGREDIENT',
  PACKAGING: 'PACKAGING',
  OTHER: 'OTHER'
};

exports.SupplierStatus = exports.$Enums.SupplierStatus = {
  APPROVED: 'APPROVED',
  EXPIRING_SOON: 'EXPIRING_SOON',
  EXPIRED: 'EXPIRED',
  PENDING: 'PENDING',
  INACTIVE: 'INACTIVE'
};

exports.RequirementType = exports.$Enums.RequirementType = {
  ONE_TIME: 'ONE_TIME',
  ANNUAL: 'ANNUAL'
};

exports.Prisma.ModelName = {
  User: 'User',
  Form: 'Form',
  FormSubmission: 'FormSubmission',
  Task: 'Task',
  Record: 'Record',
  PreOpInspection: 'PreOpInspection',
  BatchSheetTemplate: 'BatchSheetTemplate',
  BatchSheetSubmission: 'BatchSheetSubmission',
  Material: 'Material',
  Supplier: 'Supplier',
  SupplierMaterial: 'SupplierMaterial',
  DocumentRequirement: 'DocumentRequirement',
  SupplierDocument: 'SupplierDocument',
  SupplierStatusLog: 'SupplierStatusLog',
  AuditLog: 'AuditLog'
};

/**
 * This is a stub Prisma Client that will error at runtime if called.
 */
class PrismaClient {
  constructor() {
    return new Proxy(this, {
      get(target, prop) {
        let message
        const runtime = getRuntime()
        if (runtime.isEdge) {
          message = `PrismaClient is not configured to run in ${runtime.prettyName}. In order to run Prisma Client on edge runtime, either:
- Use Prisma Accelerate: https://pris.ly/d/accelerate
- Use Driver Adapters: https://pris.ly/d/driver-adapters
`;
        } else {
          message = 'PrismaClient is unable to run in this browser environment, or has been bundled for the browser (running in `' + runtime.prettyName + '`).'
        }
        
        message += `
If this is unexpected, please open an issue: https://pris.ly/prisma-prisma-bug-report`

        throw new Error(message)
      }
    })
  }
}

exports.PrismaClient = PrismaClient

Object.assign(exports, Prisma)
