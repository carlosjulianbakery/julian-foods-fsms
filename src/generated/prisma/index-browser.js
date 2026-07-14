
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
  productCode: 'productCode',
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
  productId: 'productId',
  legacyRecipe: 'legacyRecipe',
  baseUnitName: 'baseUnitName',
  baseUnitIsFinished: 'baseUnitIsFinished',
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
  submittedById: 'submittedById',
  productId: 'productId',
  recipeSnapshot: 'recipeSnapshot',
  baseUnitName: 'baseUnitName',
  baseUnitIsFinished: 'baseUnitIsFinished',
  adminNotes: 'adminNotes',
  adminNotesUpdatedByName: 'adminNotesUpdatedByName',
  adminNotesUpdatedAt: 'adminNotesUpdatedAt'
};

exports.Prisma.DailyCleaningChecklistScalarFieldEnum = {
  id: 'id',
  area: 'area',
  date: 'date',
  allMachinesCleaned: 'allMachinesCleaned',
  prepToolsCleaned: 'prepToolsCleaned',
  floorsMoppedSwept: 'floorsMoppedSwept',
  bakingTraysCleaned: 'bakingTraysCleaned',
  foodSurfacesCleaned: 'foodSurfacesCleaned',
  trashEmptied: 'trashEmptied',
  items: 'items',
  checkedBy: 'checkedBy',
  notes: 'notes',
  status: 'status',
  submittedAt: 'submittedAt',
  submittedById: 'submittedById'
};

exports.Prisma.MonthlyCleaningChecklistScalarFieldEnum = {
  id: 'id',
  date: 'date',
  items: 'items',
  checkedBy: 'checkedBy',
  notes: 'notes',
  status: 'status',
  submittedAt: 'submittedAt',
  submittedById: 'submittedById'
};

exports.Prisma.MaterialScalarFieldEnum = {
  id: 'id',
  name: 'name',
  description: 'description',
  category: 'category',
  unit: 'unit',
  isOrganic: 'isOrganic',
  isAllergen: 'isAllergen',
  allergens: 'allergens',
  isGlutenFree: 'isGlutenFree',
  hasSpecialRisk: 'hasSpecialRisk',
  specialRiskTypes: 'specialRiskTypes',
  isActive: 'isActive',
  materialType: 'materialType',
  sourceProductId: 'sourceProductId',
  isTemperatureSensitive: 'isTemperatureSensitive',
  coaRequired: 'coaRequired',
  minimumStockQuantity: 'minimumStockQuantity',
  minimumStockUnit: 'minimumStockUnit',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SupplierScalarFieldEnum = {
  id: 'id',
  name: 'name',
  manufacturerName: 'manufacturerName',
  contactName: 'contactName',
  email: 'email',
  phone: 'phone',
  address: 'address',
  notes: 'notes',
  status: 'status',
  isActive: 'isActive',
  supplierType: 'supplierType',
  isSystemLocked: 'isSystemLocked',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SupplierBrandScalarFieldEnum = {
  id: 'id',
  supplierId: 'supplierId',
  brandName: 'brandName',
  description: 'description',
  isActive: 'isActive',
  createdAt: 'createdAt'
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
  isSystemLocked: 'isSystemLocked',
  triggerType: 'triggerType',
  triggerCondition: 'triggerCondition',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.FormTemplateScalarFieldEnum = {
  id: 'id',
  name: 'name',
  description: 'description',
  filePath: 'filePath',
  fileUrl: 'fileUrl',
  fileName: 'fileName',
  fileSize: 'fileSize',
  mimeType: 'mimeType',
  requirementId: 'requirementId',
  uploadedById: 'uploadedById',
  uploadedAt: 'uploadedAt',
  updatedAt: 'updatedAt',
  isActive: 'isActive'
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
  notes: 'notes',
  receivingRecordId: 'receivingRecordId',
  lotNumber: 'lotNumber'
};

exports.Prisma.PerDeliveryObligationScalarFieldEnum = {
  id: 'id',
  supplierId: 'supplierId',
  materialId: 'materialId',
  receivingRecordId: 'receivingRecordId',
  lotNumber: 'lotNumber',
  requirementId: 'requirementId',
  status: 'status',
  documentId: 'documentId',
  createdAt: 'createdAt',
  fulfilledAt: 'fulfilledAt'
};

exports.Prisma.SupplierStatusLogScalarFieldEnum = {
  id: 'id',
  supplierId: 'supplierId',
  status: 'status',
  reason: 'reason',
  createdAt: 'createdAt'
};

exports.Prisma.ProductScalarFieldEnum = {
  id: 'id',
  name: 'name',
  category: 'category',
  productCode: 'productCode',
  description: 'description',
  isActive: 'isActive',
  recipe: 'recipe',
  allergenProfile: 'allergenProfile',
  isOrganic: 'isOrganic',
  isGlutenFree: 'isGlutenFree',
  supplierExposure: 'supplierExposure',
  shelfLifeMonths: 'shelfLifeMonths',
  presentations: 'presentations',
  isWipMaterial: 'isWipMaterial',
  createdById: 'createdById',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PurchaseOrderScalarFieldEnum = {
  id: 'id',
  poNumber: 'poNumber',
  supplierId: 'supplierId',
  supplierName: 'supplierName',
  status: 'status',
  sentDate: 'sentDate',
  estimatedDeliveryDate: 'estimatedDeliveryDate',
  actualDeliveryDate: 'actualDeliveryDate',
  notes: 'notes',
  forecastPeriodFrom: 'forecastPeriodFrom',
  forecastPeriodTo: 'forecastPeriodTo',
  createdById: 'createdById',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PurchaseOrderItemScalarFieldEnum = {
  id: 'id',
  poId: 'poId',
  materialId: 'materialId',
  materialName: 'materialName',
  qtyOrdered: 'qtyOrdered',
  unit: 'unit',
  qtyReceived: 'qtyReceived',
  qtyRemaining: 'qtyRemaining',
  isFullyReceived: 'isFullyReceived',
  source: 'source',
  wipMaterialName: 'wipMaterialName',
  notes: 'notes'
};

exports.Prisma.ReceivingRecordScalarFieldEnum = {
  id: 'id',
  recordNumber: 'recordNumber',
  date: 'date',
  timeReceived: 'timeReceived',
  receivedById: 'receivedById',
  purchaseOrderNumber: 'purchaseOrderNumber',
  materialId: 'materialId',
  materialName: 'materialName',
  isUnregisteredMaterial: 'isUnregisteredMaterial',
  materialCategoryFreetext: 'materialCategoryFreetext',
  supplierId: 'supplierId',
  supplierName: 'supplierName',
  brandId: 'brandId',
  brandName: 'brandName',
  lotNumber: 'lotNumber',
  quantityReceived: 'quantityReceived',
  unit: 'unit',
  expirationDate: 'expirationDate',
  conditionCheck: 'conditionCheck',
  coaRequired: 'coaRequired',
  coaReceived: 'coaReceived',
  coaDocumentUrl: 'coaDocumentUrl',
  submittedAt: 'submittedAt',
  notes: 'notes',
  poId: 'poId',
  poNumber: 'poNumber',
  noPOReason: 'noPOReason'
};

exports.Prisma.QuarantineRecordScalarFieldEnum = {
  id: 'id',
  recordNumber: 'recordNumber',
  receivingRecordId: 'receivingRecordId',
  materialName: 'materialName',
  supplierName: 'supplierName',
  lotNumber: 'lotNumber',
  quantity: 'quantity',
  unit: 'unit',
  quarantineReason: 'quarantineReason',
  actionTaken: 'actionTaken',
  quarantineLocation: 'quarantineLocation',
  adminNotified: 'adminNotified',
  status: 'status',
  resolutionNotes: 'resolutionNotes',
  resolvedById: 'resolvedById',
  resolvedAt: 'resolvedAt',
  createdAt: 'createdAt'
};

exports.Prisma.InventoryLotScalarFieldEnum = {
  id: 'id',
  materialId: 'materialId',
  materialName: 'materialName',
  supplierId: 'supplierId',
  supplierName: 'supplierName',
  brandId: 'brandId',
  brandName: 'brandName',
  lotNumber: 'lotNumber',
  receivingRecordId: 'receivingRecordId',
  quantityReceived: 'quantityReceived',
  quantityRemaining: 'quantityRemaining',
  unit: 'unit',
  receivedDate: 'receivedDate',
  expirationDate: 'expirationDate',
  status: 'status',
  isConditional: 'isConditional',
  conditionalNotes: 'conditionalNotes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.InventoryMovementScalarFieldEnum = {
  id: 'id',
  inventoryLotId: 'inventoryLotId',
  materialId: 'materialId',
  materialName: 'materialName',
  lotNumber: 'lotNumber',
  movementType: 'movementType',
  quantity: 'quantity',
  unit: 'unit',
  referenceType: 'referenceType',
  referenceId: 'referenceId',
  referenceNumber: 'referenceNumber',
  quantityBefore: 'quantityBefore',
  quantityAfter: 'quantityAfter',
  performedById: 'performedById',
  performedAt: 'performedAt',
  notes: 'notes'
};

exports.Prisma.CycleCountScalarFieldEnum = {
  id: 'id',
  countDate: 'countDate',
  materialId: 'materialId',
  materialName: 'materialName',
  inventoryLotId: 'inventoryLotId',
  lotNumber: 'lotNumber',
  quantityExpected: 'quantityExpected',
  quantityCounted: 'quantityCounted',
  quantityCountedOriginal: 'quantityCountedOriginal',
  quantityCountedOriginalUnit: 'quantityCountedOriginalUnit',
  variance: 'variance',
  unit: 'unit',
  reason: 'reason',
  reasonOther: 'reasonOther',
  performedById: 'performedById',
  performedAt: 'performedAt',
  notes: 'notes'
};

exports.Prisma.InitialStockEntryScalarFieldEnum = {
  id: 'id',
  materialId: 'materialId',
  materialName: 'materialName',
  supplierId: 'supplierId',
  supplierName: 'supplierName',
  brandId: 'brandId',
  brandName: 'brandName',
  lotNumber: 'lotNumber',
  quantity: 'quantity',
  unit: 'unit',
  expirationDate: 'expirationDate',
  dateReceived: 'dateReceived',
  notes: 'notes',
  inventoryLotId: 'inventoryLotId',
  enteredById: 'enteredById',
  enteredAt: 'enteredAt'
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

exports.Prisma.TaskTemplateScalarFieldEnum = {
  id: 'id',
  title: 'title',
  description: 'description',
  category: 'category',
  priority: 'priority',
  assignedTo: 'assignedTo',
  taskType: 'taskType',
  formLink: 'formLink',
  recurrenceType: 'recurrenceType',
  recurrenceConfig: 'recurrenceConfig',
  firstDueDate: 'firstDueDate',
  isActive: 'isActive',
  createdById: 'createdById',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.TaskInstanceScalarFieldEnum = {
  id: 'id',
  templateId: 'templateId',
  title: 'title',
  description: 'description',
  category: 'category',
  priority: 'priority',
  assignedTo: 'assignedTo',
  taskType: 'taskType',
  formLink: 'formLink',
  dueDate: 'dueDate',
  status: 'status',
  completedById: 'completedById',
  completedAt: 'completedAt',
  completionNote: 'completionNote',
  skippedById: 'skippedById',
  skippedAt: 'skippedAt',
  skipReason: 'skipReason',
  formSubmissionId: 'formSubmissionId',
  instanceNumber: 'instanceNumber',
  createdAt: 'createdAt'
};

exports.Prisma.TaskHistoryScalarFieldEnum = {
  id: 'id',
  instanceId: 'instanceId',
  action: 'action',
  performedById: 'performedById',
  performedAt: 'performedAt',
  note: 'note'
};

exports.Prisma.StockAlertAcknowledgmentScalarFieldEnum = {
  id: 'id',
  materialId: 'materialId',
  alertType: 'alertType',
  acknowledgedById: 'acknowledgedById',
  acknowledgedAt: 'acknowledgedAt',
  note: 'note',
  isResolved: 'isResolved',
  resolvedAt: 'resolvedAt',
  expiresAt: 'expiresAt'
};

exports.Prisma.ForecastExclusionScalarFieldEnum = {
  id: 'id',
  excludedById: 'excludedById',
  excludedAt: 'excludedAt',
  productionDate: 'productionDate',
  productName: 'productName',
  productId: 'productId',
  baseUnitCount: 'baseUnitCount',
  reason: 'reason',
  isActive: 'isActive',
  createdAt: 'createdAt'
};

exports.Prisma.InventoryAuditExclusionScalarFieldEnum = {
  id: 'id',
  submissionId: 'submissionId',
  materialId: 'materialId',
  exclusionReason: 'exclusionReason',
  excludedById: 'excludedById',
  excludedAt: 'excludedAt'
};

exports.Prisma.ShipstationProductScalarFieldEnum = {
  id: 'id',
  shipstationProductId: 'shipstationProductId',
  name: 'name',
  sku: 'sku',
  upc: 'upc',
  isBundle: 'isBundle',
  isActive: 'isActive',
  fsmsPresentationId: 'fsmsPresentationId',
  fsmsProductId: 'fsmsProductId',
  configStatus: 'configStatus',
  ignoredReason: 'ignoredReason',
  lastSyncedAt: 'lastSyncedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ShipstationBundleComponentScalarFieldEnum = {
  id: 'id',
  bundleProductId: 'bundleProductId',
  componentProductId: 'componentProductId',
  quantityPerBundle: 'quantityPerBundle',
  fsmsPresentationId: 'fsmsPresentationId',
  fsmsProductId: 'fsmsProductId'
};

exports.Prisma.ShipstationBundleConfigScalarFieldEnum = {
  id: 'id',
  bundleProductId: 'bundleProductId',
  componentProductId: 'componentProductId',
  fsmsPresentationId: 'fsmsPresentationId',
  fsmsProductId: 'fsmsProductId',
  quantityPerBundle: 'quantityPerBundle',
  createdBy: 'createdBy',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ShipstationShipmentScalarFieldEnum = {
  id: 'id',
  shipstationShipmentId: 'shipstationShipmentId',
  shipstationOrderId: 'shipstationOrderId',
  shipstationOrderNumber: 'shipstationOrderNumber',
  storeId: 'storeId',
  storeName: 'storeName',
  customerName: 'customerName',
  customerEmail: 'customerEmail',
  orderDate: 'orderDate',
  shipDate: 'shipDate',
  voided: 'voided',
  voidDate: 'voidDate',
  syncRunId: 'syncRunId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ShipstationShipmentItemScalarFieldEnum = {
  id: 'id',
  shipmentId: 'shipmentId',
  shipstationProductId: 'shipstationProductId',
  productName: 'productName',
  upc: 'upc',
  quantityShipped: 'quantityShipped',
  isBundleComponent: 'isBundleComponent',
  bundleProductName: 'bundleProductName',
  fsmsPresentationId: 'fsmsPresentationId',
  fsmsProductId: 'fsmsProductId',
  fsmsBatchSheetId: 'fsmsBatchSheetId',
  fsmsMatchStatus: 'fsmsMatchStatus',
  configStatus: 'configStatus',
  createdAt: 'createdAt'
};

exports.Prisma.ShipstationSyncLogScalarFieldEnum = {
  id: 'id',
  startedAt: 'startedAt',
  completedAt: 'completedAt',
  status: 'status',
  shipmentsFetched: 'shipmentsFetched',
  shipmentsNew: 'shipmentsNew',
  shipmentsVoided: 'shipmentsVoided',
  itemsProcessed: 'itemsProcessed',
  itemsMatched: 'itemsMatched',
  itemsUnmatched: 'itemsUnmatched',
  dateRangeFrom: 'dateRangeFrom',
  dateRangeTo: 'dateRangeTo',
  errorMessage: 'errorMessage',
  notes: 'notes',
  createdAt: 'createdAt'
};

exports.Prisma.RdIngredientScalarFieldEnum = {
  id: 'id',
  name: 'name',
  category: 'category',
  unit: 'unit',
  supplierSource: 'supplierSource',
  notes: 'notes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  createdById: 'createdById'
};

exports.Prisma.RdProjectScalarFieldEnum = {
  id: 'id',
  name: 'name',
  description: 'description',
  productType: 'productType',
  targetServingSize: 'targetServingSize',
  startedDate: 'startedDate',
  targetLaunchDate: 'targetLaunchDate',
  status: 'status',
  targetCalories: 'targetCalories',
  targetCaloriesTolerance: 'targetCaloriesTolerance',
  targetFat: 'targetFat',
  targetFatTolerance: 'targetFatTolerance',
  targetSaturatedFat: 'targetSaturatedFat',
  targetSaturatedFatTolerance: 'targetSaturatedFatTolerance',
  targetCarbs: 'targetCarbs',
  targetCarbsTolerance: 'targetCarbsTolerance',
  targetFiber: 'targetFiber',
  targetFiberTolerance: 'targetFiberTolerance',
  targetSugars: 'targetSugars',
  targetSugarsTolerance: 'targetSugarsTolerance',
  targetAddedSugars: 'targetAddedSugars',
  targetAddedSugarsTolerance: 'targetAddedSugarsTolerance',
  targetProtein: 'targetProtein',
  targetProteinTolerance: 'targetProteinTolerance',
  targetSodium: 'targetSodium',
  targetSodiumTolerance: 'targetSodiumTolerance',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  createdById: 'createdById'
};

exports.Prisma.RdIterationScalarFieldEnum = {
  id: 'id',
  projectId: 'projectId',
  iterationNumber: 'iterationNumber',
  datePerformed: 'datePerformed',
  performedBy: 'performedBy',
  batchSize: 'batchSize',
  recipe: 'recipe',
  changesFromPrior: 'changesFromPrior',
  processNotes: 'processNotes',
  outcome: 'outcome',
  nextSteps: 'nextSteps',
  status: 'status',
  actualCalories: 'actualCalories',
  actualFat: 'actualFat',
  actualSaturatedFat: 'actualSaturatedFat',
  actualCarbs: 'actualCarbs',
  actualFiber: 'actualFiber',
  actualSugars: 'actualSugars',
  actualAddedSugars: 'actualAddedSugars',
  actualProtein: 'actualProtein',
  actualSodium: 'actualSodium',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.RdSensoryEvaluationScalarFieldEnum = {
  id: 'id',
  iterationId: 'iterationId',
  evaluatorName: 'evaluatorName',
  evaluationDate: 'evaluationDate',
  ratingAppearance: 'ratingAppearance',
  ratingAroma: 'ratingAroma',
  ratingTexture: 'ratingTexture',
  ratingSweetness: 'ratingSweetness',
  ratingFlavorIntensity: 'ratingFlavorIntensity',
  ratingOverall: 'ratingOverall',
  notes: 'notes',
  recommendation: 'recommendation',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.RdAttachmentScalarFieldEnum = {
  id: 'id',
  iterationId: 'iterationId',
  fileName: 'fileName',
  fileUrl: 'fileUrl',
  fileSize: 'fileSize',
  fileType: 'fileType',
  description: 'description',
  uploadedById: 'uploadedById',
  uploadedAt: 'uploadedAt'
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

exports.CleaningArea = exports.$Enums.CleaningArea = {
  MAIN: 'MAIN',
  BARS: 'BARS'
};

exports.CleaningStatus = exports.$Enums.CleaningStatus = {
  COMPLETE: 'COMPLETE',
  INCOMPLETE: 'INCOMPLETE'
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
  ANNUAL: 'ANNUAL',
  PER_DELIVERY: 'PER_DELIVERY'
};

exports.TaskTemplateCategory = exports.$Enums.TaskTemplateCategory = {
  sanitation: 'sanitation',
  inspection: 'inspection',
  production: 'production',
  receiving_inventory: 'receiving_inventory',
  documentation_compliance: 'documentation_compliance',
  facility_maintenance: 'facility_maintenance',
  administrative: 'administrative'
};

exports.TaskTemplatePriority = exports.$Enums.TaskTemplatePriority = {
  high: 'high',
  normal: 'normal',
  low: 'low'
};

exports.TaskTemplateType = exports.$Enums.TaskTemplateType = {
  manual: 'manual',
  form_linked: 'form_linked'
};

exports.TaskRecurrenceType = exports.$Enums.TaskRecurrenceType = {
  one_time: 'one_time',
  daily: 'daily',
  weekly: 'weekly',
  biweekly: 'biweekly',
  monthly: 'monthly',
  every_2_months: 'every_2_months',
  quarterly: 'quarterly',
  every_6_months: 'every_6_months',
  annual: 'annual',
  custom: 'custom'
};

exports.TaskInstanceStatus = exports.$Enums.TaskInstanceStatus = {
  pending: 'pending',
  complete: 'complete',
  overdue: 'overdue',
  skipped: 'skipped'
};

exports.TaskHistoryAction = exports.$Enums.TaskHistoryAction = {
  created: 'created',
  completed: 'completed',
  skipped: 'skipped',
  overdue: 'overdue',
  next_instance_generated: 'next_instance_generated'
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
  DailyCleaningChecklist: 'DailyCleaningChecklist',
  MonthlyCleaningChecklist: 'MonthlyCleaningChecklist',
  Material: 'Material',
  Supplier: 'Supplier',
  SupplierBrand: 'SupplierBrand',
  SupplierMaterial: 'SupplierMaterial',
  DocumentRequirement: 'DocumentRequirement',
  FormTemplate: 'FormTemplate',
  SupplierDocument: 'SupplierDocument',
  PerDeliveryObligation: 'PerDeliveryObligation',
  SupplierStatusLog: 'SupplierStatusLog',
  Product: 'Product',
  PurchaseOrder: 'PurchaseOrder',
  PurchaseOrderItem: 'PurchaseOrderItem',
  ReceivingRecord: 'ReceivingRecord',
  QuarantineRecord: 'QuarantineRecord',
  InventoryLot: 'InventoryLot',
  InventoryMovement: 'InventoryMovement',
  CycleCount: 'CycleCount',
  InitialStockEntry: 'InitialStockEntry',
  AuditLog: 'AuditLog',
  TaskTemplate: 'TaskTemplate',
  TaskInstance: 'TaskInstance',
  TaskHistory: 'TaskHistory',
  StockAlertAcknowledgment: 'StockAlertAcknowledgment',
  ForecastExclusion: 'ForecastExclusion',
  InventoryAuditExclusion: 'InventoryAuditExclusion',
  ShipstationProduct: 'ShipstationProduct',
  ShipstationBundleComponent: 'ShipstationBundleComponent',
  ShipstationBundleConfig: 'ShipstationBundleConfig',
  ShipstationShipment: 'ShipstationShipment',
  ShipstationShipmentItem: 'ShipstationShipmentItem',
  ShipstationSyncLog: 'ShipstationSyncLog',
  RdIngredient: 'RdIngredient',
  RdProject: 'RdProject',
  RdIteration: 'RdIteration',
  RdSensoryEvaluation: 'RdSensoryEvaluation',
  RdAttachment: 'RdAttachment'
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
