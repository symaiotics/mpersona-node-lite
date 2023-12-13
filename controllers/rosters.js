//Get the lowDb
const db = require('../services/dbHelper.cjs');
exports.get = async function (req, res, next) {
    try {
        const username = req.tokenDecoded ? req.tokenDecoded.username : null;

        let rosters = await db.readAllDocuments('rosters');
        rosters = rosters.filter(roster => roster.status === 'active');

        if (username) {
            rosters = rosters.filter(roster =>
                roster.owners.includes(username) ||
                roster.editors.includes(username) ||
                roster.viewers.includes(username)
            );
        }

        let personas = await db.readAllDocuments('personas');

        rosters = rosters.map(roster => {
            let rosterPersonas = personas.filter(persona => roster.personaUuids.includes(persona.uuid));
            return {
                ...roster,
                isEditor: roster.editors.includes(username),
                isViewer: roster.viewers.includes(username),
                isOwner: roster.owners.includes(username),
                isCreatedBy: roster.createdBy === username,
                personas: rosterPersonas,
                personasCount: rosterPersonas.length
            };
        });

        res.status(200).send({ message: "Here are all the active rosters", payload: rosters });
    } catch (error) {
        console.error("Error", error);
        res.status(500).send({ message: "An error occurred while retrieving the rosters." });
    }
};

exports.getFromUuid = async function (req, res, next) {
    try {
        const rosterUuid = req.body.rosterUuid || req.query.rosterUuid || "";
        const rosters = await db.readDocumentsByCriteria('rosters', { status: 'active', uuid: rosterUuid });

        if (rosters.length > 0) {
            const roster = rosters[0];
            const personas = await db.readAllDocuments('personas');

            const rosterPersonas = roster.personaUuids.map(uuid => personas.find(persona => persona.uuid === uuid)).filter(persona => persona);

            roster.personas = rosterPersonas;
            res.status(200).send({ message: "Here is the roster requested", payload: roster });
        } else {
            res.status(404).send({ message: "Roster not found" });
        }
    } catch (error) {
        console.error("Error", error);
        res.status(500).send({ message: "An error occurred while retrieving the roster." });
    }
};
exports.create = async function (req, res, next) {
    try {
        const rostersFromBody = Array.isArray(req.body.rosters) ? req.body.rosters : [];
        const rostersFromQuery = Array.isArray(req.query.rosters) ? req.query.rosters : [];
        const rosters = [...new Set([...rostersFromBody, ...rostersFromQuery])];

        for (const item of rosters) {
            if (req.tokenDecoded) {
                item.owners = [req.tokenDecoded.username];
                item.viewers = req.tokenDecoded.viewers ? [req.tokenDecoded.viewers] : [];
                item.editors = [req.tokenDecoded.username];
                item.createdBy = req.tokenDecoded.username;
            }
            item.uuid = uuidv4();
            item.status = 'active';
            await db.createDocument('rosters', item);
        }

        res.status(201).send({ message: "Created all the identified rosters", payload: rosters });
    } catch (error) {
        console.error(error);
        res.status(500).send({ error: 'There was an error creating the rosters.' });
    }
};

exports.update = async function (req, res, next) {
    try {
        const rostersFromBody = Array.isArray(req.body.rosters) ? req.body.rosters : [];
        const rostersFromQuery = Array.isArray(req.query.rosters) ? req.query.rosters : [];
        const rosters = [...new Set([...rostersFromBody, ...rostersFromQuery])];
        const username = req.tokenDecoded ? req.tokenDecoded.username : null;
        const updatedRosters = [];

        for (const roster of rosters) {
            const { uuid, ...updateData } = roster;
            const rostersToUpdate = await db.readDocumentsByCriteria('rosters', { uuid: uuid });

            if (rostersToUpdate.length > 0) {
                const rosterToUpdate = rostersToUpdate[0];
                if (rosterToUpdate.owners.includes(username) || rosterToUpdate.editors.includes(username)) {
                    await db.updateDocumentById('rosters', rosterToUpdate.id, { ...rosterToUpdate, ...updateData });
                    updatedRosters.push({ ...rosterToUpdate, ...updateData });
                }
            }
        }

        res.status(200).send({ message: "Here are your updated rosters", payload: updatedRosters });
    } catch (error) {
        console.error(error);
        res.status(500).send({ error: 'There was an error updating the rosters.' });
    }
};
exports.addLink = async function (req, res, next) {
    try {
        const username = req.tokenDecoded?.username;
        const { rosterUuid, rosterLink, linkType } = req.body;

        if (!username) {
            return res.status(400).send({ message: "Username not found in token." });
        }

        if (!rosterUuid || !rosterLink || !['editorLink', 'viewerLink'].includes(linkType)) {
            return res.status(400).send({ message: "Missing or invalid parameters." });
        }

        const rostersToUpdate = await db.readDocumentsByCriteria('rosters', { uuid: rosterUuid });
        if (rostersToUpdate.length > 0) {
            const rosterToUpdate = rostersToUpdate[0];
            if (rosterToUpdate.editors.includes(username) || rosterToUpdate.owners.includes(username)) {
                rosterToUpdate[linkType] = rosterLink;
                await db.updateDocumentById('rosters', rosterToUpdate.id, rosterToUpdate);
                res.status(200).send({
                    message: "Link added to roster",
                    payload: rosterToUpdate 
                });
            } else {
                return res.status(403).send({ message: "No permissions to update or roster not found." });
            }
        } else {
            return res.status(404).send({ message: "Roster not found." });
        }
    } catch (error) {
        console.error(error);
        res.status(500).send({ message: "An error occurred while adding the link.", error: error.message });
    }
};
exports.linkDetails = async function (req, res, next) {
    try {
        const rosterLink = req.body.rosterLink || req.query.rosterLink || "";
        const rostersViewer = await db.readDocumentsByCriteria('rosters', { viewerLink: rosterLink });
        const rostersEditor = await db.readDocumentsByCriteria('rosters', { editorLink: rosterLink });
        const roster = rostersViewer.length > 0 ? rostersViewer[0] : (rostersEditor.length > 0 ? rostersEditor[0] : null);
        
        if (roster) {
            const result = {
                name: roster.name,
                description: roster.description,
                isEditor: roster.editorLink === rosterLink,
                isViewer: roster.viewerLink === rosterLink
            };

            res.status(200).send({
                message: "Here is the roster",
                payload: result
            });
        } else {
            res.status(404).send({ message: "Roster not found" });
        }
    } catch (error) {
        console.error(error);
        res.status(500).send({ message: "An error occurred while retrieving the roster details." });
    }
};

exports.acceptLink = async function (req, res, next) {
    try {
        const link = req.body.link || req.query.link || "";
        const username = req.tokenDecoded ? req.tokenDecoded.username : null;

        if (!username) {
            return res.status(400).send({ message: "Username not found in token" });
        }

        const rosters = await db.readAllDocuments('rosters');
        const roster = rosters.find(r => r.editorLink === link || r.viewerLink === link);

        if (!roster) {
            return res.status(404).send({ message: "Roster not found" });
        }

        let updatedRoster = { ...roster };
        if (roster.editorLink === link && !roster.editors.includes(username)) {
            updatedRoster.editors = [...roster.editors, username];
        } else if (roster.viewerLink === link && !roster.viewers.includes(username)) {
            updatedRoster.viewers = [...roster.viewers, username];
        }

        await db.updateDocumentById('rosters', roster.id, updatedRoster);

        res.status(200).send({
            message: "Roster link accepted"
        });

    } catch (error) {
        console.error(error);
        res.status(500).send({ message: "An error occurred while accepting the roster link." });
    }
};

