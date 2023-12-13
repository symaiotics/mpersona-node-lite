const db = require('../services/dbHelper.cjs');
exports.getPersonas = async function (req, res, next) {
    try {
        const viewAll = req.body.viewAll || req.query.viewAll || false;
        const username = req?.tokenDecoded?.username || null;
        const roles = req?.tokenDecoded?.roles || [];

        let personas = await db.readAllDocuments('personas');
        personas = personas.filter(persona => persona.status === 'active');

        if (!(roles.includes('admin') && viewAll)) {
            if (username) {
                personas = personas.filter(persona =>
                    persona.owners.includes(username) ||
                    persona.editors.includes(username) ||
                    persona.viewers.includes(username) ||
                    persona.publishStatus === 'published'
                );
            } else {
                personas = personas.filter(persona => persona.publishStatus === 'published');
            }
        }

        personas = personas.map(persona => {
            return {
                ...persona,
                isOwner: username ? persona.owners.includes(username) : false,
                isEditor: username ? persona.editors.includes(username) : false,
                isViewer: username ? persona.viewers.includes(username) : false,
                isAdmin: roles.includes('admin')
            };
        });

        //Only admins can see who is in which role
        // if (!roles.includes('admin')) {
        //     personas = personas.map(({ editors, viewers, owners, ...persona }) => persona);
        // }

        personas.sort((a, b) => a.name.localeCompare(b.name));
        res.status(200).send({ message: "Here are all the active personas", payload: personas });
    } catch (error) {
        console.error(error);
        res.status(400).send(error);
    }
};
exports.getCategories = async function (req, res, next) {
    try {
        const personas = await db.readAllDocuments('personas');
        let categories = [];
        personas.forEach(persona => {
            if (Array.isArray(persona.categories)) {
                persona.categories.forEach(category => {
                    if (!categories.some(c => c.code === category.code)) {
                        categories.push({
                            code: category.code,
                            alpha: category.alpha,
                            label: category.label
                        });
                    }
                });
            }
        });

        res.status(200).send({ message: "Here are all the unique categories", payload: categories });
    } catch (error) {
        res.status(400).send(error);
    }
};
exports.createPersonas = async function (req, res) {
    try {
        let personas = req.body.personas || req.query.personas || [];
        if (typeof personas === 'string') {
            try {
                personas = JSON.parse(personas);
            } catch (error) {
                // If parsing fails, respond with a bad request status
                return res.status(400).send({ message: "Invalid JSON format for personas" });
            }
        }
        if (!Array.isArray(personas)) {
            personas = [personas]; // Wrap non-array personas in an array
        }

        const createdPersonas = await Promise.all(personas.map(async (persona) => {
            if (req.tokenDecoded) {
                persona.owners = [req.tokenDecoded.username];
                persona.editors = [req.tokenDecoded.username];
                persona.viewers = [req.tokenDecoded.username];
                persona.createdBy = req.tokenDecoded.username;
            }
            persona.status = "active";
            const id = await db.createDocument('personas', persona);
            return { id, ...persona };
        }));

        res.status(201).send({ message: "Created all the identified personas", payload: createdPersonas });
    } catch (error) {
        console.error(error);
        res.status(400).send(error);
    }
};


exports.updatePersonas = async function (req, res) {
    try {
        let personas = req.body.personas || req.query.personas || [];
        if (!Array.isArray(personas)) personas = [personas];
        let updatedPersonas = [];
        let roles = req.tokenDecoded ? req.tokenDecoded.roles : [];
        let isAdmin = roles.includes('admin');
        let username = req.tokenDecoded ? req.tokenDecoded.username : null;

        for (const persona of personas) {
            let personaToUpdate = await db.readDocumentById('personas', persona.id);
            if (personaToUpdate && (isAdmin || personaToUpdate.owners.includes(username) || personaToUpdate.editors.includes(username))) {
                let mergedUpdates = updateMatchingKeys(personaToUpdate, persona);
                await db.updateDocumentById('personas', persona.id, mergedUpdates);
                updatedPersonas.push(mergedUpdates); // Push the merged updates to reflect the actual changes
            }
        }

        res.status(201).send({ message: "Here are your updated personas", payload: updatedPersonas });
    } catch (error) {
        console.error(error);
        res.status(400).send(error);
    }
};

function updateMatchingKeys(target, updates) {
    const nonUpdatableKeys = ['id', 'createdAt', 'updatedAt']; // Example non-updatable fields
    let result = { ...target };
    Object.keys(updates).forEach(key => {
        if (target.hasOwnProperty(key) && !nonUpdatableKeys.includes(key)) {
            result[key] = updates[key];
        }
    });
    return result;
}
exports.deletePersonas = async function (req, res) {
    try {
        let personas = req.body.personas || req.query.personas || [];
        let roles = req.tokenDecoded ? req.tokenDecoded.roles : [];
        let isAdmin = roles.includes('admin');
        let username = req.tokenDecoded ? req.tokenDecoded.username : null;

        let aggregateResults = [];

        for (const persona of personas) {
            let personaToDelete = await db.readDocumentById('personas', persona.id);
            if (personaToDelete && (isAdmin || personaToDelete.owners.includes(username) || personaToDelete.editors.includes(username))) {
                await db.deleteDocumentById('personas', persona.id);
                aggregateResults.push({ id: persona.id, status: "success", payload: personaToDelete });
            } else {
                aggregateResults.push({ id: persona.id, status: "failed", reason: "Permission denied or persona not found." });
            }
        }
        res.status(200).send({ message: "Processed personas", results: aggregateResults });
    } catch (error) {
        console.error(error);
        res.status(400).send(error);
    }
};
exports.addLink = async function (req, res) {
    try {
        const username = req.tokenDecoded ? req.tokenDecoded.username : null;
        const personaUuid = req.body.personaUuid || req.query.personaUuid || "";
        const personaLink = req.body.personaLink || req.query.personaLink || "";
        const linkType = req.body.linkType || req.query.linkType || "";

        if (!username) {
            return res.status(400).send({ message: "Username not found in token" });
        }

        const personasToUpdate = await db.readDocumentsByCriteria('personas', { uuid: personaUuid });
        if (personasToUpdate.length === 0) {
            return res.status(404).send({ message: "Persona not found" });
        }
        const personaToUpdate = personasToUpdate[0];

        if (personaToUpdate.editors.includes(username) || personaToUpdate.owners.includes(username)) {
            if (linkType === 'editorLink' || linkType === 'viewerLink') {
                personaToUpdate[linkType] = personaLink;
                await db.updateDocumentById('personas', personaToUpdate.id, personaToUpdate);
                res.status(200).send({
                    message: "Link added to persona",
                    payload: personaToUpdate 
                });
            } else {
                return res.status(400).send({ message: "Invalid linkType" });
            }
        } else {
            return res.status(403).send({ message: "Permission denied" });
        }
    } catch (error) {
        console.error("Error", error);
        res.status(400).send(error);
    }
};
exports.linkDetails = async function (req, res, next) {
    try {
        var personaLink = req.body.personaLink || req.query.personaLink || "";
        const personaViewers = await db.readDocumentsByCriteria('personas', { viewerLink: personaLink });
        const personaEditors = await db.readDocumentsByCriteria('personas', { editorLink: personaLink });
        let persona = (personaEditors.length > 0 && personaEditors[0]) || (personaViewers.length > 0 && personaViewers[0]) || null;
        
        if (persona) {
            var result = {
                name: persona.name,
                description: persona.description,
                url: persona.url,
                isEditor: persona.editorLink === personaLink,
                isViewer: persona.viewerLink === personaLink
            };

            res.status(200).send({
                message: "Here is the persona",
                payload: result
            });
        } else {
            res.status(404).send({ message: "Persona not found" });
        }
    } catch (error) {
        console.error("Error", error);
        res.status(400).send(error);
    }
};
exports.acceptLink = async function (req, res, next) {
    try {
        const personaLink = req.body.personaLink || req.query.personaLink || "";
        const username = req.tokenDecoded ? req.tokenDecoded.username : null;

        if (!username) {
            return res.status(400).send({ message: "Username not found in token" });
        }

        const personaViewers = await db.readDocumentsByCriteria('personas', { viewerLink: personaLink });
        const personaEditors = await db.readDocumentsByCriteria('personas', { editorLink: personaLink });
        let persona = (personaEditors.length > 0 && personaEditors[0]) || (personaViewers.length > 0 && personaViewers[0]) || null;
        
        if (!persona) {
            return res.status(404).send({ message: "Persona not found" });
        }

        let updatedPersona = { ...persona };
        if (persona.editorLink === personaLink && !persona.editors.includes(username)) {
            updatedPersona.editors = [...persona.editors, username];
        } else if (persona.viewerLink === personaLink && !persona.viewers.includes(username)) {
            updatedPersona.viewers = [...persona.viewers, username];
        }

        await db.updateDocumentById('personas', persona.id, updatedPersona);

        res.status(201).send({
            message: "Persona link accepted"
        });

    } catch (error) {
        console.error("Error", error);
        res.status(500).send({ message: "An error occurred while accepting the persona link." });
    }
};


const checkUserRole = (req, res, next) => {
    const roles = req.tokenDecoded ? req.tokenDecoded.roles : [];
    req.isAdmin = roles.includes('admin');
    next();
};

const validatePayload = (req, res, next) => {
    const publishStatus = req.body.publishStatus || req.query.publishStatus;
    const personaUuids = req.body.personaUuids || req.query.personaUuids || [];

    if (!publishStatus) {
        return res.status(400).send({ message: "Publish status is required" });
    }
    if (!personaUuids.length) {
        return res.status(400).send({ message: "Persona UUID is required" });
    }

    req.publishStatus = publishStatus;
    req.personaUuids = personaUuids;

    next();
};


exports.publishPersonas = [
    checkUserRole,
    validatePayload,
    async function (req, res, next) {
        try {
            const { isAdmin, publishStatus, personaUuids } = req;
            let modifiedCount = 0;

            for (const uuid of personaUuids) {
                let personas = await db.readDocumentsByCriteria('personas', { uuid: uuid });
                if (personas.length > 0) {
                    let persona = personas[0];

                    if (isAdmin || persona.owners.includes(req.tokenDecoded.username) || persona.editors.includes(req.tokenDecoded.username)) {
                        let updatedPersona = { ...persona, published: publishStatus };
                        await db.updateDocumentById('personas', persona.id, updatedPersona);
                        modifiedCount++;
                    }
                }
            }

            res.status(200).send({
                message: "Publish status updated",
                modifiedCount: modifiedCount
            });
        } catch (error) {
            console.error("Error", error);
            res.status(500).send({ message: "An error occurred while updating the publish status." });
        }
    }
];
