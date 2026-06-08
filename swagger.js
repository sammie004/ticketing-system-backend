// swagger.js
const swaggerAutogen = require('swagger-autogen')();

const doc = {
  info: {
    title: 'Pyramid-Africa API',
    description: 'Ticketing Platform API'
  },
  host: 'localhost:3000',
  schemes: ['http']
};

const outputFile = './swagger-output.json';

const endpointsFiles = [
  './server.js',
  './routes/authRoutes.js',
  './routes/events.js',
  './routes/buy.js',
  './routes/user.js',
  './routes/verify.js',
  './routes/getDash.js',
  './routes/creator-dash.js',
  './routes/create-ticket.js',
  './routes/wallet-routes.js',
  './routes/webhook.js'
];

swaggerAutogen(outputFile, endpointsFiles, doc)
  .then(() => {
    console.log('Swagger generated successfully');
  })
  .catch(err => {
    console.error(err);
  });