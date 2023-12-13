const db = require('../services/dbHelper.cjs');

exports.getLexicon = async function (req, res, next) {
    try {
        const lexiconEntries = db.get('lexicon').sortBy('code').value();
        res.status(200).json({ message: 'full lexicon', payload: lexiconEntries });
    } catch (error) {
        res.status(500).send({ message: "Error retrieving lexicon entries", error });
    }
};

exports.updateLexicon = async function (req, res, next) {
    try {
        const { words } = req.body;
        if (!Array.isArray(words)) {
            return res.status(400).send({ message: "Invalid input. 'words' must be an array." });
        }
        words.forEach((word) => {
            const existingWord = db.get('lexicon').find({ code: word.code }).value();
            if (existingWord) {
                db.get('lexicon')
                    .find({ code: word.code })
                    .assign(word)
                    .write();
            } else {
                db.get('lexicon')
                    .push(word)
                    .write();
            }
        });
        res.status(200).send({ message: "Lexicon updated successfully" });
    } catch (error) {
        res.status(500).send({ message: "Error updating lexicon", error });
    }
};


exports.deleteLexicon = async function (req, res, next) {
    try {
        const { code } = req.params;
        const result = db.get('lexicon').remove({ code }).write();
        if (result.length === 0) {
            return res.status(404).send({ message: "Lexicon entry not found" });
        }
        res.status(200).send({ message: "Lexicon entry deleted successfully" });
    } catch (error) {
        res.status(500).send({ message: "Error deleting lexicon entry", error });
    }
};

