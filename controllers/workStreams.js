const db = require('../services/dbHelper.cjs');

exports.getWorkStreams = async function (req, res, next) {
    try {
        

        var query = { status: 'active', createdBy: 'public' };
        var username = req.tokenDecoded ? req.tokenDecoded.username : null;

        let workStreams = db.get('workStreams').filter(query).value();

        if (username) {
            workStreams = db.get('workStreams').filter({ status: 'active' }).value();
            workStreams = workStreams.filter(ws =>
                ws.owners.includes(username) ||
                ws.editors.includes(username) ||
                ws.viewers.includes(username) ||
                ws.createdBy === username ||
                ws.createdBy === 'public'
            );
        }

        workStreams = workStreams.map(({ editors, viewers, owners, createdBy, ...ws }) => ws);

        res.status(201).send({ message: "Here are all the work streams", payload: workStreams });
    } catch (error) {
        res.status(400).send(error);
    }
};

exports.createWorkStreams = async function (req, res, next) {
    try {
        

        var workStreams = req.body.workStreams || req.query.workStreams || [];
        if (!Array.isArray(workStreams)) workStreams = [workStreams];

        workStreams.forEach((workStream) => {
            workStream.uuid = uuidv4(); // Generate a unique ID
            workStream.createdBy = 'public';
            if (req.tokenDecoded) {
                workStream.createdBy = req.tokenDecoded.username;
                workStream.owners = [req.tokenDecoded.username];
                workStream.editors = [req.tokenDecoded.username];
                workStream.viewers = [req.tokenDecoded.username];
            }
            db.get('workStreams').push(workStream).write();
        });

        res.status(201).send({ message: "Created all the identified workStreams", payload: workStreams });
    } catch (error) {
        console.log(error);
        res.status(400).send(error);
    }
};

exports.updateWorkStreams = async function (req, res, next) {
    try {

        

        var workStreams = req.body.workStreams || req.query.workStreams || [];
        if (!Array.isArray(workStreams)) workStreams = [workStreams];
        var username = req.tokenDecoded ? req.tokenDecoded.username : null;
        var updatedWorkStreams = [];

        workStreams.forEach((workStream) => {
            const { uuid, ...updateData } = workStream;
            let workStreamToUpdate = db.get('workStreams').find({ uuid });

            if (workStreamToUpdate.value() && (workStreamToUpdate.value().owners.includes(username) || workStreamToUpdate.value().editors.includes(username) || workStreamToUpdate.value().createdBy === username)) {
                workStreamToUpdate.assign(updateData).write();
                updatedWorkStreams.push(workStreamToUpdate.value());
            }
        });

        res.status(201).send({ message: "Here are your updated Work Streams", payload: updatedWorkStreams });
    } catch (error) {
        console.log(error);
        res.status(400).send(error);
    }
};


exports.deleteWorkStream = async function (req, res, next) {
    try {

        

        var workStreamUuid = req.body.workStreamUuid || req.query.workStreamUuid || "";
        var workStreamToDelete = db.get('workStreams').find({ uuid: workStreamUuid });

        if (workStreamToDelete.value()) {
            db.get('workStreams').remove({ uuid: workStreamUuid }).write();
            res.status(201).send({ message: "Deleted one Work Stream" });
        } else {
            res.status(404).send({ message: "Work Stream not found" });
        }
    } catch (error) {
        console.log(error);
        res.status(400).send(error);
    }
};
