#!/usr/bin/env node
import React from 'react';
import {render} from 'ink';
import meow from 'meow';
import App from './ui.js';

const cli = meow(
	`
		Usage
		  $ nbtca-welcome

		Options
		  --name, -n  Your name

		Examples
		  $ nbtca-welcome --name="Jane"
	`,
	{
		importMeta: import.meta,
		flags: {
			name: {
				type: 'string',
				shortFlag: 'n',
			},
		},
	},
);

render(React.createElement(App, cli.flags));
