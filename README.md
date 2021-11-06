# NEX Documentation generator

## What is this
This tool builds out MarkDown documentation for NEX protocols found within 3DS and WiiU game dumps using the games DDL Parse Trees

## Usage
### CLI
```bash
$ node build-docs.js -i ./pokemony/exefs/code.bin -o ./docs/pokemony
```

### Programable
```javascript
const DDL = require('ddl-parser');
const { generateDocumentation } = require('nex-documentation-generator');
const pokemonDumpPath = `${__dirname}/../pokemony/exefs/code.bin`;

const trees = DDL.parse(pokemonDumpPath);

for (const tree of trees) {
	generateDocumentation(tree, `${__dirname}/doc/pokemony`);
}
```

## Notes
Not all titles have complete DDL Parse Trees. In those cases this tool will generate empty protocols