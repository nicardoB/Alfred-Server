import express from 'express';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Load the swagger.yaml file
const swaggerDocument = YAML.load(path.join(__dirname, '../../swagger.yaml'));

// Swagger UI options
const options = {
  customCss: `
    .swagger-ui .topbar { display: none }
    .swagger-ui .info .title { color: #3b82f6; }
    .swagger-ui .scheme-container { background: #f8fafc; padding: 20px; border-radius: 8px; }
  `,
  customSiteTitle: "Alfred Server API Documentation",
  customfavIcon: "/favicon.ico"
};

// Serve Swagger UI
router.use('/api-docs', swaggerUi.serve);
router.get('/api-docs', swaggerUi.setup(swaggerDocument, options));

// Serve raw OpenAPI spec
router.get('/openapi.yaml', (req, res) => {
  res.setHeader('Content-Type', 'text/yaml');
  res.sendFile(path.join(__dirname, '../../swagger.yaml'));
});

router.get('/openapi.json', (req, res) => {
  res.json(swaggerDocument);
});

export default router;
