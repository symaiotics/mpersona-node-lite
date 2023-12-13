//Generating JWT Secrets
// const crypto = require('crypto');
// const secret = crypto.randomBytes(64).toString('hex');
// console.log('signing secret', secret)

//Create the app object
const express = require("express");
const app = express();
const path = require('path');
const http = require('http');
const url = require('url');
const WebSocket = require('ws');
const uuidv4 = require('uuid').v4;


//function initiateAiServices() {
  //Initiate OpenAI
  // if (process.env.OPENAI_API_KEY) {
    const OpenAI = require('openai');
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY // This is also the default, can be omitted
    });
  // }

  //Initiate Anthropic
  // if (process.env.ANTHROPIC_API_KEY) {
    const Anthropic = require('@anthropic-ai/sdk')
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY, // defaults to process.env["ANTHROPIC_API_KEY"]
    });
  // }
//}


//Process JSON and urlencoded parameters
app.use(express.json({ extended: true, limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' })); //The largest incoming payload

//Establish local environment variables
const dotenv = require('dotenv').config()

//Select the default port
const port = process.env.PORT || 3000;

//Implement basic protocols with Helmet and CORS
const helmet = require('helmet');
app.use(helmet()) //You may need to set parameters such as contentSecurityPolicy: false,

const cors = require('cors');
// var corsOptions = {
//   origin: ['https://somedomain.com'], //restrict to only use this domain for requests
//   optionsSuccessStatus: 200, // For legacy browser support
//   methods: "GET, POST, PUT, DELETE" //allowable methods
// }

//Implement context-specific CORS responses
// if (process.env.MODE == 'PROD') app.use(cors(corsOptions)); //Restrict CORS
// if (process.env.MODE == 'DEV') 

app.use(cors(
  { exposedHeaders: ['Content-Length', 'Content-Type', 'auth-token', 'auth-token-decoded'] }
)); //Unrestricted CORS

//Register Custom Global Middleware
const logger = require("../middleware/logger").logger;
app.use(logger)

//Create HTTP Server
const server = http.createServer(app);
server.listen(port, () => console.log(`mPersona Lite Node.js service listening at http://localhost:${port}`))

// app.use((req, res, next) => {
//   console.log('Protocol:', req.protocol);
//   console.log('Host:', req.get('host'));
//   console.log('Original URL:', req.originalUrl);
//   next();
// });


app.use((req, res, next) => {
  req.fullUrl = req.protocol + '://' + req.get('host') + req.originalUrl;
  next();
});

//New WSS
const wss = new WebSocket.Server({ server });
const clients = {}; // Create an object to store WebSocket instances by UUID

const sendToClient = (uuid, session, type, message = null) => {
  const clientWs = clients[uuid];
  if (clientWs && clientWs.readyState === WebSocket.OPEN) {
    const response = JSON.stringify({ session, type, message });
    clientWs.send(response);
  } else {
    console.error(`No open WebSocket found for UUID: ${uuid}`);
  }
}

wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.uuid = uuidv4();
  clients[ws.uuid] = ws;  // Store the WebSocket instance by UUID
  ws.send(JSON.stringify({ uuid: ws.uuid }));

  ws.on('message', (message) => {

    try {
      const data = JSON.parse(message);
      // Ensure the message contains a valid UUID before proceeding
      if (data.uuid) {
        if (data.type === 'ping') {
          // Use the sendToClient function to send the pong response only to the client that sent the ping
          sendToClient(data.uuid, data.session, 'pong');
        }

        else if (data.type === 'prompt') {
          // Use the sendToClient function to send the pong response only to the client that sent the ping
          prompt(data.uuid, data.session, data.provider || 'openAi', data.model || 'gpt-4', data.temperature, data.systemPrompt, data.userPrompt, data.messageHistory, data.knowledgeProfileUuids);
        }

        else {
          // Use the sendToClient function to send an error response only to the client that sent the unrecognized message
          sendToClient(data.uuid, data.session, 'error', 'Unrecognized message type');
        }
      } else {
        // Respond with an error if the UUID is missing
        ws.send(JSON.stringify({ message: 'UUID is missing from the message' }));
      }
    } catch (error) {
      console.error('Failed to parse message:', error);
      // Respond with a generic error message if the message cannot be parsed
      ws.send(JSON.stringify({ message: 'Error processing message' }));
    }
  });

  ws.on('close', () => {
    // Remove the WebSocket instance from the clients object when the connection is closed
    delete clients[ws.uuid];
  });
});

//Execute an OpenAI prompt
async function prompt(uuid, session, provider, model, temperature, systemPrompt, userPrompt, messageHistory, knowledgeProfileUuids) {

  //Enrich the prompt with some context data
  // userPrompt = "The date is " + new Date().toDateString() + "\n\n" + userPrompt + "\n\n";
  let messages = [];
  if (messageHistory?.length) {
    messages = messageHistory;
  }

  else {
    messages = [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: userPrompt
      }
    ];
  }


  //Get the Knowwledge Profiles information
  //Retrieves the facts from the DB and appends them to the systemPrompt

  try {
    //Works with both openAi and anthropic
    var fullPrompt = {
      model: model,
      temperature: parseFloat(temperature) || 0.5,
      stream: true,
    };

    //Initiate the stream
    let responseStream;
    if (provider === 'openAi') {
      fullPrompt.messages = messages;
      responseStream = await openai.chat.completions.create(fullPrompt);
    }

    else if (provider === 'anthropic') {
      fullPrompt.prompt = formatAnthropic(messages);
      fullPrompt.max_tokens_to_sample = 4096; //Recommended for Claude 2.1 
      responseStream = await anthropic.completions.create(fullPrompt);
    }

    //Handle the Streamed tokens in response and return them to the client
    for await (const part of responseStream) {

      try {

        if (provider === 'openAi') {
          if (part?.choices?.[0]?.delta?.content) sendToClient(uuid, session, "message", part.choices[0].delta.content)
          else sendToClient(uuid, session, "EOM", null)
        }

        if (provider === 'anthropic') {
          if (part.completion && !part.stop_reason) sendToClient(uuid, session, "message", part.completion)
          if (part.stop_reason) sendToClient(uuid, session, "EOM", null);
        }

      }
      catch (error) {
        //Send error back to the client
        var errorObj = {
          status: error?.response?.status,
          statusText: error?.response?.statusText
        }
        sendToClient(uuid, session, "ERROR", JSON.stringify(errorObj))
        console.error('Could not JSON parse stream message', message, errorObj);
      }


    }

    //Old V3 OpenAI API Format
    // responseStream.data.on('data', data => {

    //   const lines = data.toString().split('\n').filter(line => line.trim() !== '');
    //   for (const line of lines) {
    //     const message = line.replace(/^data: /, '');
    //     if (message === '[DONE]') {
    //       //Send EOM back to the client
    //       sendToClient(uuid, session, "EOM", null)
    //     }
    //     else {
    //       try {
    //         const parsed = JSON.parse(message).choices?.[0]?.delta?.content;
    //         if (parsed && parsed !== null && parsed !== 'null' && parsed !== 'undefined' && parsed !== undefined) {
    //           //Send the fragment back to the correct client
    //           // console.log(parsed)
    //           sendToClient(uuid, session, "message", parsed)
    //         }

    //       } catch (error) {
    //         //Send error back to the client
    //         var errorObj = {
    //           status: error?.response?.status,
    //           statusText: error?.response?.statusText
    //         }
    //         sendToClient(uuid, session, "ERROR", JSON.stringify(errorObj))
    //         console.error('Could not JSON parse stream message', message, errorObj);
    //       }
    //     }
    //   }
    // });
  }
  catch (error) {
    console.log("Error", error)
    try {
      var errorObj = {
        status: error?.response?.status,
        statusText: error?.response?.statusText
      }
      sendToClient(uuid, session, "ERROR", JSON.stringify(errorObj))
      console.error('Could not JSON parse stream message', errorObj);
    }
    catch (sendError) {
      console.log("Send Error", sendError)
    }
    // res.status(500).send({ message: "Prompt failure", payload: error })
  }
}

// prompt: `${Anthropic.HUMAN_PROMPT} How many toes do dogs have?${Anthropic.AI_PROMPT}`,
function formatAnthropic(messageHistory) {
  let anthropicString = "";
  messageHistory.forEach((message, index) => {
    const prompt = message.role === 'system'
      ? (index === 0 ? '' : Anthropic.AI_PROMPT)
      : Anthropic.HUMAN_PROMPT;
    anthropicString += prompt + message.content;

  });
  anthropicString += Anthropic.AI_PROMPT;
  return anthropicString; // Return the resulting string
}

//Export the app for use on the index.js page
module.exports = { app, wss, sendToClient, prompt, openai };