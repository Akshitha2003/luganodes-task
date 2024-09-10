require('dotenv').config();
const { Web3 } = require('web3');
const winston = require('winston');
const axios = require('axios');

// Telegram Bot Setup
const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

// To send Telegram notification
async function sendTelegramNotification(message) {
  const url = `https://api.telegram.org/bot${telegramToken}/sendMessage`;
  const body = {
    chat_id: chatId,
    text: message,
  };

  try {
    const response = await axios.post(url, body);
    if (response.data.ok) {
      console.log('Telegram message sent successfully.');
    } else {
      console.error(`Error sending Telegram message: ${response.data.description}`);
    }
  } catch (error) {
    console.error('Error sending Telegram message:', error);
  }
}

// Setup logging with Winston
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'deposit-tracker.log' })
  ]
});

const alchemyUrl = `wss://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;

// New Web3 instance
const web3 = new Web3(alchemyUrl);

const depositContractAddress = '0x00000000219ab540356cBB839Cbe05303d7705Fa';

// Async function to track Ethereum deposits
async function trackDeposits() {
  try {
    const subscription = await web3.eth.subscribe('newHeads');

    subscription.on('data', async (blockHeader) => {
      try {
        const block = await web3.eth.getBlock(blockHeader.number, true);
        logger.info(`New block received: ${block.number}`);
        
        block.transactions.forEach(async (tx) => {
          if (tx.to && tx.to.toLowerCase() === depositContractAddress.toLowerCase()) {
            logger.info(`Deposit detected in transaction: ${tx.hash}`);

            const receipt = await web3.eth.getTransactionReceipt(tx.hash);
            const depositDetails = {
              blockNumber: tx.blockNumber,
              blockTimestamp: (await web3.eth.getBlock(tx.blockNumber)).timestamp,
              fee: web3.utils.fromWei(
                (BigInt(tx.gasPrice) * BigInt(receipt.gasUsed)).toString(), 'ether'),
              hash: tx.hash,
              sender: tx.from,
            };

            logger.info('Deposit details:', depositDetails);

            const message = `Deposit detected!\nTransaction Hash: ${tx.hash}\nDetails: ${JSON.stringify(depositDetails, null, 2)}`;
            await sendTelegramNotification(message);
          }
        });
      } catch (err) {
        logger.error('Error processing block:', err);
      }
    });

    // Handle subscription errors
    subscription.on('error', (error) => {
      logger.error('Error during subscription:', error);
    });
  } catch (err) {
    logger.error('Error setting up the tracker:', err);
  }
}

trackDeposits();