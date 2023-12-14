//Adapted from https://stackoverflow.com/questions/77065143/azure-gpt-api-stream-response
//Made it work with Node.js instead of Browser

const { OpenAIClient, AzureKeyCredential } = require("@azure/openai");
const { Readable } = require('stream');
require("dotenv").config();

const endpoint = process.env["AZURE_OPENAI_ENDPOINT"];
const azureApiKey = process.env["AZURE_OPENAI_KEY"];

const messages = [
  { role: "system", content: "You are a helpful assistant." },
  { role: "user", content: "Can you help me?" },
  { role: "user", content: "Generate Lorem Ipsum text." },
];

async function main() {
  console.log("== Streaming Chat Completions Sample ==");

  const client = new OpenAIClient(endpoint, new AzureKeyCredential(azureApiKey));
  const deploymentId = "gpt-4";
  const events = await client.listChatCompletions(deploymentId, messages, { maxTokens: 128 });
  
  // Assuming events is an async iterable
  const stream = Readable.from(events);
  
  stream.on('data', (event) => {
    for (const choice of event.choices) {
      if (choice.delta?.content !== undefined) {
        console.log(choice.delta?.content);
      }
    }
  });

  stream.on('end', () => {
    console.log('Stream ended.');
  });
}

main().catch((err) => {
  console.error("The sample encountered an error:", err);
});