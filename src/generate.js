const DDL = require('ddl-parser');
const fs = require('fs-extra');
const he = require('he');
require('colors');

// * Non-ES module version of https://github.com/sindresorhus/log-symbols
const main = {
	info: 'ℹ'.blue,
	success: '✔'.green,
	warning: '⚠'.yellow,
	error: '✖'.red,
};

const fallback = {
	info: 'i'.blue,
	success: '√'.green,
	warning: '‼'.yellow,
	error: '×'.red,
};

const logSymbols = isUnicodeSupported() ? main : fallback;

const KINNAY_WIKI_BASE = 'https://github.com/kinnay/NintendoClients/wiki';

// * Standardize the type names to match Kinnay's wiki
const COMMON_TYPE_CONVERSIONS = {
	'qvector<byte>': 'Buffer',
	'byte': 'Uint8',
	'uint16': 'Uint16',
	'uint32': 'Uint32',
	'uint64': 'Uint64',
	'int8': 'Sint8',
	'int16': 'Sint16',
	'int32': 'Sint32',
	'int64': 'Sint64',
	'string': 'String',
	'bool': 'Bool',
	'datetime': 'DateTime',
	'qresult': 'Result',
	'stationurl': 'StationURL',
	'qBuffer': 'qBuffer', // * Just so it's found
	'buffer': 'Buffer',
	'ResultRange': 'ResultRange', // * Just so it's found
	'variant': 'Variant',
	'any<Data,string>': 'AnyDataHolder' // * Unsure if this can look different
};

// * Links to common types in Kinnay's wiki
const COMMON_TYPE_LINKS = {
	'String': `${KINNAY_WIKI_BASE}/NEX-Common-Types#string`,
	'Buffer': `${KINNAY_WIKI_BASE}/NEX-Common-Types#buffer`,
	'qBuffer': `${KINNAY_WIKI_BASE}/NEX-Common-Types#qbuffer`,
	'List': `${KINNAY_WIKI_BASE}/NEX-Common-Types#list`,
	'Map': `${KINNAY_WIKI_BASE}/NEX-Common-Types#map`,
	'PID': `${KINNAY_WIKI_BASE}/NEX-Common-Types#pid`,
	'Result': `${KINNAY_WIKI_BASE}/NEX-Common-Types#result`,
	'DateTime': `${KINNAY_WIKI_BASE}/NEX-Common-Types#datetime`,
	'StationURL': `${KINNAY_WIKI_BASE}/NEX-Common-Types#stationurl`,
	'Variant': `${KINNAY_WIKI_BASE}/NEX-Common-Types#variant`,
	'Structure': `${KINNAY_WIKI_BASE}/NEX-Common-Types#structure`,
	'Data': `${KINNAY_WIKI_BASE}/NEX-Common-Types#data`,
	'AnyDataHolder': `${KINNAY_WIKI_BASE}/NEX-Common-Types#anydataholder`,
	'RVConnectionData': `${KINNAY_WIKI_BASE}/NEX-Common-Types#rvconnectiondata`,
	'ResultRange': `${KINNAY_WIKI_BASE}/NEX-Common-Types#resultrange`
};

let unknownDDLCount = 0;
let unknownProtocolNameCounter = 0;

const SEEN_PROTOCOLS = {};

function generateDocumentation(tree, outputPath) {

	// * First parse out the larger DDL parse tree
	// * into smaller, more managable, pieces
	const protocolMethods = [];
	const protocolClasses = [];
	let protocolName;
	let protocolID;

	const protocolDeclarations = tree.rootNamespace.elements.filter(element => element.body instanceof DDL.DDLProtocolDeclaration);
	const classDeclarations = tree.rootNamespace.elements.filter(element => element.body instanceof DDL.DDLClassDeclaration);

	if (protocolDeclarations.length === 0) {
		unknownDDLCount += 1;
		const jsonOutput = `${outputPath}/ddl-${unknownDDLCount++}.json`;
		console.log(`[${logSymbols.warning}]`, `Found DDL tree with no protocol declaration. Writing to ${jsonOutput}\n`.yellow.bold);
		fs.ensureDirSync(`${outputPath}`);
		fs.writeFileSync(jsonOutput, JSON.stringify(tree, null, 4));
	} else {

		// * First go over all the classes and carve them out
		for (const classDeclaration of classDeclarations) {
			const className = classDeclaration.body.typeDeclaration.declaration.nameSpaceItem.parseTreeItem1.name.value;
			const classMembers = [];
			let classParentClassName = classDeclaration.body.parentClassName.value;

			if (classParentClassName === '') {
				classParentClassName = 'Structure';
			}

			for (const { body: classMember } of classDeclaration.body.classMembers.elements) {
				const classMemberName = classMember.nameSpaceItem.parseTreeItem1.name.value;
				const classMemberType = classMember.declarationUse.name.value;

				classMembers.push({
					name: classMemberName,
					type: classMemberType
				});
			}

			protocolClasses.push({
				name: className,
				members: classMembers,
				parentClassName: classParentClassName
			});
		}

		for (const protocolDeclaration of protocolDeclarations) {
			// * Start building the protocol definition
			// ? Could also be element.body.declaration.unitName.value
			protocolName = protocolDeclaration.body.declaration.nameSpaceItem.parseTreeItem1.name.value;
			protocolID = 'Unknown ID'; // TODO - Find a way to find this!!

			if (!protocolName) {
				protocolName = `Unknown Protocol - ${unknownProtocolNameCounter++}`;
				console.log(`[${logSymbols.warning}]`, `Could not determine real protocol name. Defaulting to ${protocolName}`.yellow.bold);
			} else {
				// * Just in case there's duplicate named protocols
				if (!SEEN_PROTOCOLS[protocolName]) {
					SEEN_PROTOCOLS[protocolName] = 1;
				} else {
					SEEN_PROTOCOLS[protocolName] += 1;
					protocolName = `${protocolName} (${SEEN_PROTOCOLS[protocolName]})`;
				}
			}

			console.log(`[${logSymbols.info}]`, `Found NEX protocol: ${protocolName}`.cyan.bold);

			for (const { body: method} of protocolDeclaration.body.methods.elements) {
				const methodName = method.methodDeclaration.declaration.nameSpaceItem.parseTreeItem1.name.value;
				const methodRequestParameters = [];
				const methodResponseParameters = [];

				// ? These are also stored in method.methodDeclaration.parameters
				for (const { body: parameter } of method.parameters.elements) {
					const parameterName = parameter.variable.nameSpaceItem.parseTreeItem1.name.value;
					// ? This also seems to be stored in parameter.variable.declarationUse
					const parameterValue = parameter.declarationUse.name.value;
					const parameterType = parameter.type;
					const paramaterDefinition = {
						name: parameterName,
						value: parameterValue
					};

					let done = false;
					if (parameterType & 1) {
						methodRequestParameters.push(paramaterDefinition);
						done = true;
					}

					if (parameterType & 2) {
						methodResponseParameters.push(paramaterDefinition);
						done = true;
					}

					if (!done && parameter instanceof DDL.DDLReturnValue) {
						// ! ReturnValue types always come first
						methodResponseParameters.unshift(paramaterDefinition);
					} else if (!done) {
						throw new Error(`Unknown paramater type ${parameterType}`);
					}
				}

				protocolMethods.push({
					name: methodName,
					requestParameters: methodRequestParameters,
					responseParameters: methodResponseParameters,
				});
			}


			const markdown = buildMarkdown(protocolName, protocolID, protocolMethods, protocolClasses);
			fs.ensureDirSync(`${outputPath}`);
			fs.writeFileSync(`${outputPath}/${protocolName}.md`, markdown);

			console.log(`[${logSymbols.success}]`, `Writing protocol documentation to ${outputPath}/${protocolName}.md\n`.green.bold);
		}
	}
}

function buildMarkdown(protocolName, protocolID, protocolMethods, protocolClasses) {
	// * Now start building a .md file for the protocol
	let mdFileContents = `## [NEX-Protocols](${KINNAY_WIKI_BASE}/NEX-Protocols) > ${protocolName} (${protocolID})`;

	const methodsTable = buildMethodsTable(protocolMethods);
	mdFileContents += `\n\n${methodsTable}`;

	for (const protocolMethod of protocolMethods) {
		const methodID = protocolMethods.indexOf(protocolMethod) + 1;
		const methodDocumentation = buildMethodDocumentation(protocolMethod, methodID, protocolClasses);
		mdFileContents += `\n\n${methodDocumentation}`;
	}

	if (protocolClasses.length > 0) {
		mdFileContents += '\n\n# Types';
		mdFileContents += buildClassesDocumentation(protocolClasses);
	}

	return mdFileContents;
}

function buildMethodsTable(protocolMethods) {
	let table = '| Method ID | Method Name |';
	table += '\n| --- | --- |';

	for (const protocolMethod of protocolMethods) {
		const methodID = protocolMethods.indexOf(protocolMethod) + 1;
		const methodHyperlink = `[${protocolMethod.name}](#${methodID}-${protocolMethod.name.toLowerCase()})`;

		table += `\n| ${methodID} | ${methodHyperlink} |`;
	}

	return table;
}

function buildMethodDocumentation(protocolMethod, methodID, protocolClasses) {
	let methodDocumentation = `# (${methodID}) ${protocolMethod.name}`;

	let requestDocumentation = '\n\n## Request';

	if (protocolMethod.requestParameters.length === 0) {
		requestDocumentation += '\nThis method does not take any parameters';
	} else {
		requestDocumentation += buildParametersTable(protocolMethod.requestParameters, protocolClasses);
	}

	methodDocumentation += requestDocumentation;

	let responseDocumentation = '\n\n## Response';

	if (protocolMethod.responseParameters.length === 0) {
		responseDocumentation += '\nThis method does not return anything';
	} else {
		responseDocumentation += buildParametersTable(protocolMethod.responseParameters, protocolClasses);
	}

	methodDocumentation += responseDocumentation;

	return methodDocumentation;
}

function buildClassesDocumentation(protocolClasses) {
	let classesDocumentation = '';

	for (const protocolClass of protocolClasses) {
		const parentClassInFile = protocolClasses.some(({ name }) => name === protocolClass.parentClassName);
		let parentClassName = protocolClass.parentClassName;

		if (parentClassInFile) {
			parentClassName = `[${parentClassName}](#${parentClassName.toLowerCase()}-structure)`;
		}

		if (COMMON_TYPE_CONVERSIONS[parentClassName]) {
			parentClassName = COMMON_TYPE_CONVERSIONS[parentClassName];
		}

		if (COMMON_TYPE_LINKS[parentClassName]) {
			parentClassName = `[${parentClassName}](${COMMON_TYPE_LINKS[parentClassName]})`;
		}

		const structureClassName = `[Structure](${COMMON_TYPE_LINKS['Structure']})`;

		let classDocumentation = `\n\n## ${protocolClass.name} (${structureClassName})`;

		if (parentClassName !== structureClassName) {
			classDocumentation += `\n> This structure inherits from ${parentClassName}`;
			classDocumentation += '\n';
		}

		if (protocolClass.members.length === 0) {
			classDocumentation += '\nThis structure does not contain any fields.';
		} else {
			classDocumentation += '\n| Type | Name |';
			classDocumentation += '\n| --- | --- |';

			for (const member of protocolClass.members) {
				const memberType = typeToMarkdown(member.type, protocolClasses);
				classDocumentation += `\n| ${he.encode(memberType)} | ${member.name} |`;
			}
		}

		classesDocumentation += classDocumentation;
	}

	return classesDocumentation;
}

function buildParametersTable(parameters, protocolClasses) {
	let table = '';

	table += '\n| Type | Name | Description |';
	table += '\n| --- | --- | --- |';

	for (const parameter of parameters) {
		const type = typeToMarkdown(parameter.value, protocolClasses);
		table += `\n| ${he.encode(type)} | ${parameter.name} |  |`;
	}

	return table;
}

function typeToMarkdown(type, protocolClasses) {
	if (COMMON_TYPE_CONVERSIONS[type]) {
		type = COMMON_TYPE_CONVERSIONS[type];
	}

	if (COMMON_TYPE_LINKS[type]) {
		type = `[${type}](${COMMON_TYPE_LINKS[type]})`;
	}

	if (isListType(type)) {
		type = listTypeToMarkdown(type, protocolClasses);
	}

	const isProtocolClass = protocolClasses.some(({ name }) => name === type);
	if (isProtocolClass) {
		type = `[${type}](#${type.toLowerCase()}-structure)`;
	}

	return type;
}

function isListType(type) {
	// * Lists are defined in multiple ways
	return type.startsWith('std_list<') || type.startsWith('qvector<') || type.startsWith('qlist<');
}

function listTypeToMarkdown(type, protocolClasses) {
	const listParts = type.split(/[<>]/);
	let listType = listParts[1];
	const listTypeInFile = protocolClasses.some(({ name }) => name === listType);

	if (listParts.length !== 2) {
		// * Possibly a nested list
		const subtype = listParts.slice(1).join('<');

		if (isListType(subtype)) {
			listType = listTypeToMarkdown(subtype, protocolClasses);
		}
	}

	if (listTypeInFile) {
		listType = `[${listType}](#${listType.toLowerCase()}-structure)`;
	}

	if (COMMON_TYPE_CONVERSIONS[listType]) {
		listType = COMMON_TYPE_CONVERSIONS[listType];
	}

	if (COMMON_TYPE_LINKS[listType]) {
		listType = `[${listType}](${COMMON_TYPE_LINKS[listType]})`;
	}

	return `[List](${COMMON_TYPE_LINKS['List']})<${listType}>`;
}

module.exports = {
	generateDocumentation
};

function isUnicodeSupported() {
	if (process.platform !== 'win32') {
		return process.env.TERM !== 'linux'; // * Linux console (kernel)
	}

	return Boolean(process.env.CI)
		|| Boolean(process.env.WT_SESSION) // * Windows Terminal
		|| process.env.ConEmuTask === '{cmd::Cmder}' // * ConEmu and cmder
		|| process.env.TERM_PROGRAM === 'vscode'
		|| process.env.TERM === 'xterm-256color'
		|| process.env.TERM === 'alacritty'
		|| process.env.TERMINAL_EMULATOR === 'JetBrains-JediTerm';
}
