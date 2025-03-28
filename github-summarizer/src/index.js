#!/usr/bin/env node

import { Command } from 'commander';
import { config } from 'dotenv';
import { summarizeRepo } from './github.js';
import chalk from 'chalk';

// Load environment variables
config();

const program = new Command();

program
  .name('github-summarizer')
  .description('CLI to summarize GitHub repository activity using LangChain and Ollama')
  .version('1.0.0');

program
  .command('summarize')
  .description('Summarize GitHub activity for a repository')
  .argument('<repo>', 'GitHub repository in format "owner/repo"')
  .option('-d, --days <days>', 'Time period in days to check', '7')
  .option('-m, --model <model>', 'Ollama model to use', 'mistral')
  .action(async (repo, options) => {
    try {
      // Validate repository format
      if (!repo.includes('/')) {
        console.error(chalk.red('Error: Repository must be in format "owner/repo"'));
        process.exit(1);
      }

      const [owner, repoName] = repo.split('/');
      const days = parseInt(options.days);
      
      if (isNaN(days) || days <= 0) {
        console.error(chalk.red('Error: Days must be a positive number'));
        process.exit(1);
      }

      console.log(chalk.blue(`\n🔍 Analyzing ${chalk.bold(owner + '/' + repoName)} for the last ${days} days...\n`));
      
      const summary = await summarizeRepo({
        owner,
        repo: repoName,
        days,
        model: options.model
      });

      console.log(chalk.green('\n📋 Activity Summary:'));
      console.log(chalk.white(summary));
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

program.parse(process.argv);

// Show help if no arguments provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
} 