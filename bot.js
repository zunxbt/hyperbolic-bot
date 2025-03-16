require('dotenv').config();
const { Telegraf } = require('telegraf');
const LocalSession = require('telegraf-session-local');
const axios = require('axios');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

const session = new LocalSession({
  getSessionKey: (ctx) => ctx.from && ctx.from.id ? ctx.from.id.toString() : undefined
});
bot.use(session.middleware());

const models = {
  text: {
    'meta_llama': {
      displayName: '🦙 Meta Llama 3.1 8B',
      apiModelName: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
      maxTokens: 2048,
      temperature: 0.7,
      topP: 0.9
    },
    'deepseek': {
      displayName: '🔍 DeepSeek V3',
      apiModelName: 'deepseek-ai/DeepSeek-V3',
      maxTokens: 512,
      temperature: 0.1,
      topP: 0.9
    },
    'hermes': {
      displayName: '⚡ Hermes-3-Llama-3.1-70B',
      apiModelName: 'NousResearch/Hermes-3-Llama-3.1-70B',
      maxTokens: 2048,
      temperature: 0.7,
      topP: 0.9
    },
    'qwen': {
      displayName: '💻 Qwen2.5-Coder-32B-Instruct',
      apiModelName: 'Qwen/Qwen2.5-Coder-32B-Instruct',
      maxTokens: 512,
      temperature: 0.1,
      topP: 0.9
    }
  },
  image: {
    'flux': {
      displayName: '🎨 FLUX.1-dev',
      apiModelName: 'FLUX.1-dev'
    },
    'sd2': {
      displayName: '🖼️ SD2',
      apiModelName: 'SD2'
    }
  },
  audio: {
    'melo_tts': {
      displayName: '🔊 Melo TTS'
    }
  }
};

function showCategorySelection(ctx) {
  ctx.reply('*📂 Choose a category:*', {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '📝 Text Models', callback_data: 'category_text' }],
        [{ text: '🖼️ Image Models', callback_data: 'category_image' }],
        [{ text: '🎧 Audio Models', callback_data: 'category_audio' }]
      ]
    }
  });
}

function showModelSelection(ctx, category) {
  const modelList = models[category];
  const buttons = Object.entries(modelList).map(([key, model]) => [{
    text: model.displayName,
    callback_data: `model_${key}`
  }]);
  ctx.reply(`*🔧 Choose ${category} model:*`, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: buttons
    }
  });
}

function getModelCategory(modelKey) {
  for (const category in models) {
    if (models[category][modelKey]) {
      return category;
    }
  }
  return null;
}

function getModelInfo(modelKey) {
  for (const category in models) {
    if (models[category][modelKey]) {
      return models[category][modelKey];
    }
  }
  return null;
}

const getSwitchModelKeyboard = () => ({
  inline_keyboard: [
    [{ text: '🔄 Switch Model', callback_data: 'switch_model' }]
  ]
});

async function handleModelInput(ctx, input) {
  const modelKey = ctx.session.selectedModel;
  const apiKey = ctx.session.apiKey;
  let url, data, headers;

  if (!apiKey) {
    await ctx.reply('🔐 *Please send your API key first!*', { parse_mode: 'Markdown' });
    return;
  }

  if (!modelKey) {
    await ctx.reply('⚠️ *Select model first using /switch*', { parse_mode: 'Markdown' });
    return;
  }

  const modelInfo = getModelInfo(modelKey);
  if (!modelInfo) {
    await ctx.reply('❌ *Model not found!*', { parse_mode: 'Markdown' });
    return;
  }

  headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${apiKey}`
  };

  const category = getModelCategory(modelKey);

  if (category === 'text') await ctx.sendChatAction('typing');
  else if (category === 'image') await ctx.sendChatAction('upload_photo');
  else if (category === 'audio') await ctx.sendChatAction('upload_voice');

  if (category === 'text') {
    url = "https://api.hyperbolic.xyz/v1/chat/completions";
    data = {
      messages: [{ role: "user", content: input }],
      model: modelInfo.apiModelName,
      max_tokens: modelInfo.maxTokens,
      temperature: modelInfo.temperature,
      top_p: modelInfo.topP
    };
  } else if (category === 'image') {
    url = "https://api.hyperbolic.xyz/v1/image/generation";
    data = {
      model_name: modelInfo.apiModelName,
      prompt: input,
      steps: 30,
      cfg_scale: 5,
      enable_refiner: false,
      height: 1024,
      width: 1024,
      backend: "auto"
    };
  } else if (category === 'audio') {
    url = "https://api.hyperbolic.xyz/v1/audio/generation";
    data = { text: input, speed: 1 };
  }

  try {
    const response = await axios.post(url, data, { headers });
    const result = response.data;

    if (category === 'text') {
      const answer = result.choices[0].message.content;
      await ctx.reply(`💡 ${answer}`, {
        parse_mode: 'Markdown',
        reply_markup: getSwitchModelKeyboard()
      });
    } else if (category === 'image') {
      const imageData = result.images?.[0]?.image;
      if (imageData) {
        await ctx.replyWithPhoto(
          { source: Buffer.from(imageData, 'base64') },
          { caption: '🖼️ Generated Image', reply_markup: getSwitchModelKeyboard() }
        );
      } else {
        await ctx.reply('❌ No image generated', { reply_markup: getSwitchModelKeyboard() });
      }
    } else if (category === 'audio') {
      const audioData = result.audio;
      if (audioData) {
        await ctx.replyWithAudio(
          { source: Buffer.from(audioData, 'base64') },
          { caption: '🔊 Generated Audio', reply_markup: getSwitchModelKeyboard() }
        );
      } else {
        await ctx.reply('❌ No audio generated', { reply_markup: getSwitchModelKeyboard() });
      }
    }
  } catch (error) {
    console.error('🚨 Error:', error);
    const errorMsg = error.response?.status === 401
      ? '🔑 Invalid API Key'
      : '⚠️ Processing Error';
    await ctx.reply(`❌ ${errorMsg}`, { parse_mode: 'Markdown' });
  }
}

bot.command('start', (ctx) => {
  if (!ctx.session.apiKey) {
    ctx.reply(
      '*Welcome to Hyperbolic AI Bot*\n\n' +
      'To get started, send your Hyperbolic API Key:\n' +
      '1. Visit [Hyperbolic Website](https://app.hyperbolic.xyz/) and Log In\n' +
      '2. Go to the *Settings* section\n' +
      '3. Copy your API Key\n' +
      '4. Paste it here\n\n' +
      '🛡️ *Security Notice:*\n' +
      '- Your API key is stored securely\n' +
      '- You can remove it using /remove\n' +
      '- This bot only stores your key for session access\n\n',
      {
        parse_mode: 'Markdown',
      }
    );
  } else {
    ctx.reply('🔁 Restarting session...');
    showCategorySelection(ctx);
  }
});

bot.command('switch', (ctx) => {
  if (!ctx.session.apiKey) {
    ctx.reply('🔒 *API key required*', { parse_mode: 'Markdown' });
  } else {
    showCategorySelection(ctx);
  }
});

bot.command('remove', (ctx) => {
  if (ctx.session.apiKey) {
    delete ctx.session.apiKey;
    delete ctx.session.selectedModel;
    ctx.reply('🗑️ *Credentials removed*', { parse_mode: 'Markdown' });
  } else {
    ctx.reply('ℹ️ *No stored credentials*', { parse_mode: 'Markdown' });
  }
});

bot.command('help', (ctx) => {
  ctx.reply(
    '📚 *Commands:*\n' +
    '*/start* - Initialize bot\n' +
    '*/switch* - Change model\n' +
    '*/remove* - Clear data\n' +
    '*/help* - Show this help',
    { parse_mode: 'Markdown' }
  );
});

bot.on('text', async (ctx) => {
  if (!ctx.session.apiKey) {
    ctx.session.apiKey = ctx.message.text;
    ctx.reply('✅ *API key saved!*', { parse_mode: 'Markdown' });
    showCategorySelection(ctx);
  } else if (ctx.session.selectedModel) {
    await handleModelInput(ctx, ctx.message.text);
  } else {
    ctx.reply('⚠️ *Select model first!*', { parse_mode: 'Markdown' });
  }
});

bot.on('callback_query', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const data = ctx.callbackQuery.data;

    if (data === 'switch_model') {
      showCategorySelection(ctx);
    } else if (data.startsWith('category_')) {
      const category = data.split('_')[1];
      showModelSelection(ctx, category);
    } else if (data.startsWith('model_')) {
      const modelKey = data.replace('model_', '');
      ctx.session.selectedModel = modelKey;
      const modelInfo = getModelInfo(modelKey);
      await ctx.reply(`🎯 Selected: ${modelInfo.displayName}`);
    }
  } catch (error) {
    console.error('🚨 Callback Error:', error);
    await ctx.reply('❌ Action failed');
  }
});

bot.launch();
console.log('🤖 Bot running...');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
