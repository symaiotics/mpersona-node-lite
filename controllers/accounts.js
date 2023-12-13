//Accounts Controller
/*
The accounts controller contains the logic which processes API method received by the route
*/
//Load the specific controller plugins

//Get the lowDb
const db = require('../services/dbHelper.cjs');
const createJWT = require('../middleware/verify').createJWT;

//Plugins
const uuidv4 = require('uuid').v4;
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

function validateEmail(email) {
    if (!email) return false;
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(String(email).toLowerCase());
}

exports.joinMailingList = async function (req, res) {
    try {
        let emailAddress = req.body.emailAddress || req.query.emailAddress;

        if (!emailAddress || !validateEmail(emailAddress)) {
            return res.status(400).json({ message: 'Invalid or No Email Address Provided' });
        }

        // Create a new document in the 'mailingLists' collection
        const id = await db.createDocument('mailingLists', { emailAddress });

        // If an ID was returned, the operation was successful
        if (id) {
            res.status(200).json({ message: "success", payload: { id, emailAddress } });
        } else {
            // If no ID was returned, there was a failure to save the document
            res.status(500).json({ message: "failure" });
        }
    } catch (error) {
        res.status(500).json({ message: "Server Error", error: error.message });
    }
};

exports.createNewAccount = async function (req, res) {
    try {

        //Reload the accounts
        await db.loadLowdb('accounts', true); 

        var password = req.body.password || req.query.password || req.params.password;
        var password2 = req.body.password2 || req.query.password2 || req.params.password2;

        var newAccount = {
            uuid: uuidv4(),
            username: req.body.username || req.query.username || req.params.username,
            email: req.body.email || req.query.email || req.params.email,
            useCase: req.body.useCase || req.query.useCase || req.params.useCase,
            notes: req.body.notes || req.query.notes || req.params.notes,
            preferredLng: req.body.preferredLng || req.query.preferredLng || req.params.preferredLng || 'en',
            roles: ['user'],
            active: true,
            momentCreated: new Date(),
        };

        if (!newAccount.username) {
            // console.log("No username found");
            return res.status(400).json({ message: 'noUsername', payload: null });
        } else {
            var findAccounts = await db.readDocumentsByCriteria('accounts', {username:newAccount.username});
            if (findAccounts?.length) {
                // console.log("User already exists", findAccount);
                return res.status(400).json({ message: 'userExists', payload: null });
            }
        }

        if (!password || password.length < 8 || password !== password2) {
            return res.status(400).json({ message: 'passwordsDontMatch', payload: null });
        }

        const salt = bcrypt.genSaltSync(10);
        var hashedPassword = bcrypt.hashSync(password, salt);
        newAccount.salt = salt;
        newAccount.password = hashedPassword;

         await db.createDocument('accounts', newAccount);

        let { password:rmPassword, salt:rmSalt, ... returnToken}  = newAccount;
        // if (accountId) {
            var newToken = createJWT(returnToken, req.fullUrl); // Assuming createJWT is synchronous
            res.header('auth-token', newToken.token);
            res.header('auth-token-decoded', JSON.stringify(newToken.tokenDecoded));
            res.status(200).json({ message: "success", payload: { token: newToken.token, tokenDecoded: newToken.tokenDecoded } });
        // } else {
        //     res.status(500).json({ message: "failure", payload: null });
        // }
    } catch (error) {
        res.status(500).json({ message: "Server Error", error: error.message });
    }
};

exports.login = async function (req, res) {
    try {
        await db.loadLowdb('accounts', true);

        const username = req.body.username || req.query.username || req.params.username || null;
        const password = req.body.password || req.query.password || req.params.password || null;

        const findAccounts = await db.readDocumentsByCriteria('accounts', { username: username });
        console.log("FindAccounts", findAccounts)
        
        if (findAccounts.length === 0) {
            return res.status(400).json({ message: 'usernameNotFound', payload: null });
        } else {
            const findAccount = findAccounts[0];
            console.log(findAccount)
            const isMatch = bcrypt.compareSync(password, findAccount.password);
            if (!isMatch) {
                return res.status(400).json({ message: 'passwordNotFound', payload: null });
            } else {
                const updatedAccount = {
                    ...findAccount,
                    momentLastLogin: new Date(),
                    passwordResetRequired: null,
                    passwordResetRequested: null,
                    passwordResetToken: null,
                    momentPasswordResetTokenExpires: null,
                    momentFirstLogin: findAccount.momentFirstLogin || new Date()
                };

                await db.updateDocumentById('accounts', findAccount.uuid, updatedAccount);

                const newToken = createJWT(findAccount, req.fullUrl);
                res.header('auth-token', newToken.token);
                res.header('auth-token-decoded', JSON.stringify(newToken.tokenDecoded));

                res.status(200).json({ message: "Success", payload: { token: newToken.token, tokenDecoded: newToken.tokenDecoded } });
            }
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error", error: error.message });
    }
};