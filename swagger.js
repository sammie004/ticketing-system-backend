const swaggerJSDoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

const swaggerSpec = swaggerJSDoc({
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Pyramid-Africa API",
      version: "1.0.0",
      description: "Ticketing Platform API"
    },
    servers: [
      {
        url: "http://localhost:3000",
        description: "Local"
      },
      {
        url: "https://YOUR-NGROK-URL.ngrok-free.app",
        description: "Test Environment"
      }
    ]
  },
  apis: ["./routes/*.js"] // specify the path to your route files
});
console.log("Swagger spec generated:", swaggerSpec); // Debugging line to check the generated spec
module.exports = (app) => {
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
};