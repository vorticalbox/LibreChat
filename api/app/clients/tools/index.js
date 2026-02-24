const manifest = require('./manifest');

// Structured Tools - OpenAI only
const DALLE3 = require('./structured/DALLE3');
const GoogleSearchAPI = require('./structured/GoogleSearch');
const createOpenAIImageTools = require('./structured/OpenAIImageTools');

// Removed non-OpenAI tools:
// - FluxAPI (external image gen)
// - OpenWeather (weather API)
// - StableDiffusion (external image gen)
// - StructuredACS/AzureAISearch (Azure)
// - TraversaalSearch (search API)
// - StructuredWolfram (Wolfram Alpha)
// - TavilySearchResults (search API)
// - createGeminiImageTool (Google Gemini)

module.exports = {
  ...manifest,
  // Structured Tools
  DALLE3,
  GoogleSearchAPI,
  createOpenAIImageTools,
};
