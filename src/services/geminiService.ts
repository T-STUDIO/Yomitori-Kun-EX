import { GoogleGenAI, Type } from "@google/genai";

export function getGeminiClient(): GoogleGenAI {
  const userKey = typeof window !== 'undefined' ? localStorage.getItem('gemini_api_key') : null;
  const apiKey = userKey || process.env.GEMINI_API_KEY || "";
  if (!apiKey) {
    throw new Error("Gemini APIキーが設定されていません。ヘッダーの「設定」ボタンから設定してください。");
  }
  return new GoogleGenAI({ apiKey });
}

export enum ProcessingMode {
  RECEIPT = "receipt",
  BUSINESS_CARD = "business_card",
  TRANSLATION = "translation",
}

export interface ReceiptData {
  date: string;
  totalAmount: number;
  currency: string;
  merchant: string;
  items: { name: string; price: number }[];
}

export interface BusinessCardData {
  companyName: string;
  name: string;
  department: string;
  title: string;
  address: string;
  phone: string;
  mobile: string;
  email: string;
}

export interface TranslationData {
  originalText: string;
  translatedText: string;
  detectedLanguage: string;
}

const receiptSchema = {
  type: Type.OBJECT,
  properties: {
    date: { type: Type.STRING, description: "Date of the receipt (YYYY-MM-DD)" },
    totalAmount: { type: Type.NUMBER, description: "Total amount" },
    currency: { type: Type.STRING, description: "Currency code (e.g., JPY, USD)" },
    merchant: { type: Type.STRING, description: "Name of the merchant" },
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          price: { type: Type.NUMBER },
        },
      },
    },
  },
  required: ["date", "totalAmount", "merchant"],
};

const receiptsArraySchema = {
  type: Type.ARRAY,
  items: receiptSchema,
};

const businessCardSchema = {
  type: Type.OBJECT,
  properties: {
    companyName: { type: Type.STRING },
    name: { type: Type.STRING },
    department: { type: Type.STRING },
    title: { type: Type.STRING },
    address: { type: Type.STRING },
    phone: { type: Type.STRING },
    mobile: { type: Type.STRING },
    email: { type: Type.STRING },
  },
  required: ["name"],
};

const businessCardsArraySchema = {
  type: Type.ARRAY,
  items: businessCardSchema,
};

const translationSchema = {
  type: Type.OBJECT,
  properties: {
    originalText: { type: Type.STRING },
    translatedText: { type: Type.STRING },
    detectedLanguage: { type: Type.STRING },
  },
  required: ["originalText", "translatedText"],
};

export async function processImage(base64Image: string, mode: ProcessingMode) {
  const model = "gemini-3.5-flash";
  
  let prompt = "";
  let schema: any = {};

  switch (mode) {
    case ProcessingMode.RECEIPT:
      prompt = "Extract ALL receipts found in the image. Return an array of receipt objects. Focus on date, merchant, and total amount for each.";
      schema = receiptsArraySchema;
      break;
    case ProcessingMode.BUSINESS_CARD:
      prompt = "Extract ALL business cards found in the image. Return an array of business card objects.";
      schema = businessCardsArraySchema;
      break;
    case ProcessingMode.TRANSLATION:
      prompt = "Extract all text from the image and translate it into Japanese if it's in another language. If it's already in Japanese, translate it into English.";
      schema = translationSchema;
      break;
  }

  const ai = getGeminiClient();

  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64Image.split(",")[1] || base64Image,
            },
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: schema,
    },
  });

  return JSON.parse(response.text);
}
