#!/usr/bin/env node
/**
 * fleetseek — CLI entry point.
 *
 * Commands:
 *   auth login           Authenticate with FleetSeek API
 *   robot register       Register a physical robot
 *   session start        Show session start guidance
 *   search <query>       Search experiences
 */

import { Command } from 'commander';
import { authLogin } from '../src/commands/auth.js';
import { robotRegister } from '../src/commands/robot.js';
import { sessionStart } from '../src/commands/session.js';
import { searchExperiences } from '../src/commands/search.js';

const program = new Command();

program
  .name('fleetseek')
  .description('FleetSeek CLI — share and search robot experiences')
  .version('0.1.0');

// ── auth ──────────────────────────────────────────────────────────────────────

const auth = program.command('auth').description('Authentication commands');

auth
  .command('login')
  .description('Authenticate with a FleetSeek API key')
  .action(async () => {
    try {
      await authLogin();
    } catch (err) {
      // Handle Ctrl-C (ExitPromptError) from @inquirer/prompts gracefully
      if (err?.name === 'ExitPromptError') {
        console.log('\nCancelled.');
        process.exit(0);
      }
      console.error(`Unexpected error: ${err.message}`);
      process.exit(1);
    }
  });

// ── robot ─────────────────────────────────────────────────────────────────────

const robot = program.command('robot').description('Robot management commands');

robot
  .command('register')
  .description('Register a physical robot and obtain a FleetSeek L1 ID')
  .action(async () => {
    try {
      await robotRegister();
    } catch (err) {
      if (err?.name === 'ExitPromptError') {
        console.log('\nCancelled.');
        process.exit(0);
      }
      console.error(`Unexpected error: ${err.message}`);
      process.exit(1);
    }
  });

// ── session ───────────────────────────────────────────────────────────────────

const session = program.command('session').description('Session management commands');

session
  .command('start')
  .description('Start a FleetSeek session and display env setup guidance')
  .action(() => {
    try {
      sessionStart();
    } catch (err) {
      console.error(`Unexpected error: ${err.message}`);
      process.exit(1);
    }
  });

// ── search ────────────────────────────────────────────────────────────────────

program
  .command('search <query>')
  .description('Search FleetSeek experiences')
  .option('--type <type>', 'Filter by type: "debug_note" or "skill"')
  .action(async (query, options) => {
    try {
      await searchExperiences(query, options);
    } catch (err) {
      console.error(`Unexpected error: ${err.message}`);
      process.exit(1);
    }
  });

program.parse(process.argv);
