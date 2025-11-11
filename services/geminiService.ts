
import { GoogleGenAI } from "@google/genai";
import { DocumentFile } from '../types';

const SYSTEM_INSTRUCTION = `You are an intelligent assistant built to analyze and answer questions about uploaded documents. Your primary goal is to provide clear, accurate, and concise answers based ONLY on the text from the documents provided.

Answering Rules:
1.  **Strictly Grounded:** Base your entire response strictly on the content of the provided document(s). Do not use any external knowledge.
2.  **Cite Sources:** If possible, include a brief reference to where the information was found (e.g., section name, document name, or a key phrase). Format it at the end of your main answer, starting with "Source:".
3.  **Handle Uncertainty:** If the answer to a question cannot be found in the document, you MUST respond with the exact phrase: "This information doesn’t appear in the provided document."
4.  **Summaries:** When asked for a summary, provide it in a simple, factual, bullet-point list.
5.  **Clarity and Conciseness:** Keep your answers direct and to the point.
`;

export const askAboutDocuments = async (question: string, documents: DocumentFile[]): Promise<string> => {
  if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable not set");
  }
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  // Fix: Improved prompt structure by separating context from instructions.
  const documentsContext = documents.map(doc => `
---
Document: ${doc.name}
Content:
${doc.content}
---
  `).join('\n');

  const userPrompt = `
CONTEXT FROM DOCUMENTS:
${documentsContext}

Based on the document(s) provided, answer the following question.

USER QUESTION:
${question}
`;

  try {
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: userPrompt,
        config: {
            systemInstruction: SYSTEM_INSTRUCTION
        }
    });
    return response.text;
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    throw new Error("Failed to get a response from the AI. Please check the console for details.");
  }
};
