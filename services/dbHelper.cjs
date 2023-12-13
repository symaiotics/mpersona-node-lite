const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

const dbInstances = {};

async function loadLowdb(schema, force) {
  const dbPath = `./db/${schema}.json`;

  // Check if the db file exists or if force is true, then reinitialize
  if (force || !fs.existsSync(dbPath)) {
    const { JSONPreset } = await import('lowdb/node');
    const defaultData = {};
    defaultData[schema] = [];
    dbInstances[schema] = await JSONPreset(dbPath, defaultData);
    await dbInstances[schema].write(); // Ensure the file is created if it doesn't exist
  } else if (!dbInstances[schema]) {
    // Load the db instance if it's not already loaded
    const { JSONPreset } = await import('lowdb/node');
    const defaultData = {};
    defaultData[schema] = [];
    dbInstances[schema] = await JSONPreset(dbPath, defaultData);
  }

  return dbInstances[schema];
}

async function createDocument(schema, documentData) {
  const db = await loadLowdb(schema);
  const id = uuidv4();
  db.data[schema].push({ id,  ...documentData, uuid:id });
  await db.write();
  return id;
}

async function readDocumentById(schema, id) {
  const db = await loadLowdb(schema);
  return db.data[schema].find(doc => doc.id === id);
}

async function readDocumentsByCriteria(schema, criteria) {
  const db = await loadLowdb(schema);
  return db.data[schema].filter(matchWithObject(criteria));
}

// async function readDocumentsByCriteria(schema, criteria) {
//   const db = await loadLowdb(schema);
//   let results = db.data[schema].find(matchWithObject(criteria));
//   if(!Array.isArray(results)) results = [results]
//   return results;
// }


//Creates a find function based on the object criteria
function matchWithObject(criteria) {
  return (element) => Object.keys(criteria).every(
    (key) => element[key] === criteria[key]
  );
}

async function readAllDocuments(schema) {
  const db = await loadLowdb(schema);
  return db.data[schema];
}

async function updateDocumentById(schema, id, newDocumentData) {
  const db = await loadLowdb(schema);
  const index = db.data[schema].findIndex(doc => doc.id === id);
  if (index !== -1) {
    db.data[schema][index] = { id, ...newDocumentData };
    await db.write();
  }
}

async function deleteDocumentById(schema, id) {
  const db = await loadLowdb(schema);
  const index = db.data[schema].findIndex(doc => doc.id === id);
  if (index !== -1) {
    db.data[schema].splice(index, 1);
    await db.write();
  }
}

module.exports = {
  loadLowdb,
  createDocument,
  readDocumentById,
  readDocumentsByCriteria,
  readAllDocuments,
  updateDocumentById,
  deleteDocumentById
};