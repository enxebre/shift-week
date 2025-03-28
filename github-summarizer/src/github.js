import { Octokit } from 'octokit';
import ora from 'ora';
import chalk from 'chalk';
import { ChatOllama } from '@langchain/community/chat_models/ollama';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { StructuredOutputParser } from 'langchain/output_parsers';
import { z } from 'zod';

/**
 * Simple function to fetch data from GitHub API
 * @param {string} url - The API URL to fetch from
 * @param {Object} options - Fetch options
 * @returns {Promise<Object>} - Promise resolving to parsed JSON data
 */
async function fetchGitHubAPI(url, options = {}) {
  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'GitHub-Activity-Summarizer',
        ...(options.headers || {})
      },
      ...options
    });
    
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }
    
    return response.json();
  } catch (error) {
    console.error(chalk.red(`Failed to fetch from GitHub: ${error.message}`));
    throw error;
  }
}

/**
 * Creates a structured output parser for the summary format
 * @returns {StructuredOutputParser} - Parser for the summary format
 */
// TODO: I dropped this because it was struggling to parse the llm response
function createSummaryParser() {
  const parser = StructuredOutputParser.fromZodSchema(
    z.object({
      overview: z.string().optional().describe('A high-level overview of the repository activity'),
      issues: z.object({
        total: z.number().optional().describe('Total number of issues processed'),
        open: z.number().optional().describe('Number of open issues'),
        closed: z.number().optional().describe('Number of closed issues'),
        summary: z.string().optional().describe('Summary of key issues and their status'),
        notableIssues: z.array(z.object({
          number: z.number().optional(),
          title: z.string().optional(),
          status: z.string().optional(),
          description: z.string().optional()
        })).optional().describe('Notable issues that deserve special attention')
      }).optional(),
      pullRequests: z.object({
        total: z.number().optional().describe('Total number of PRs processed'),
        open: z.number().optional().describe('Number of open PRs'),
        merged: z.number().optional().describe('Number of merged PRs'),
        closed: z.number().optional().describe('Number of closed PRs'),
        summary: z.string().optional().describe('Summary of key PRs and their status'),
        notablePRs: z.array(z.object({
          number: z.number().optional(),
          title: z.string().optional(),
          status: z.string().optional(),
          description: z.string().optional()
        })).optional().describe('Notable PRs that deserve special attention')
      }).optional(),
      contributors: z.object({
        total: z.number().optional().describe('Total number of unique contributors'),
        topContributors: z.array(z.object({
          username: z.string().optional(),
          contributions: z.number().optional(),
          description: z.string().optional()
        })).optional().describe('Top contributors and their activity')
      }).optional(),
      recommendations: z.array(z.string()).optional().describe('Recommendations based on the activity analysis')
    })
  );
  
  return parser;
}

/**
 * Fetches recent issues for a given repository
 * @param {Object} options - The options object
 * @param {string} options.owner - Repository owner
 * @param {string} options.repo - Repository name
 * @param {number} options.days - Number of days to look back
 * @returns {Promise<Array>} - Promise resolving to array of issues
 */
async function fetchRecentIssues({ owner, repo, days }) {
  const spinner = ora('Fetching recent issues...').start();
  
  try {
    // Calculate date from X days ago
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString();
    
    // Use GitHub search API to find issues
    const url = `https://api.github.com/search/issues?q=repo:${owner}/${repo}+is:issue+updated:>=${sinceStr.split('T')[0]}&sort=updated&order=desc&per_page=30`;
    const data = await fetchGitHubAPI(url);
    
    spinner.succeed(`Fetched ${data.items.length} issues from the last ${days} days`);
    return data.items;
  } catch (error) {
    spinner.fail(`Failed to fetch issues: ${error.message}`);
    throw error;
  }
}

/**
 * Fetches recent pull requests for a given repository
 * @param {Object} options - The options object
 * @param {string} options.owner - Repository owner
 * @param {string} options.repo - Repository name
 * @param {number} options.days - Number of days to look back
 * @returns {Promise<Array>} - Promise resolving to array of PRs
 */
async function fetchRecentPullRequests({ owner, repo, days }) {
  const spinner = ora('Fetching recent pull requests...').start();
  
  try {
    // Calculate date from X days ago
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString();
    
    // Use GitHub search API to find PRs
    const url = `https://api.github.com/search/issues?q=repo:${owner}/${repo}+is:pr+updated:>=${sinceStr.split('T')[0]}&sort=updated&order=desc&per_page=30`;
    const data = await fetchGitHubAPI(url);
    
    spinner.succeed(`Fetched ${data.items.length} pull requests from the last ${days} days`);
    return data.items;
  } catch (error) {
    spinner.fail(`Failed to fetch pull requests: ${error.message}`);
    throw error;
  }
}

/**
 * Creates a system prompt for the LLM
 * @param {Object} activityData - The GitHub activity data
 * @param {string} formatInstructions - Format instructions from the parser
 * @returns {string} - The system prompt
 */
function createSystemPrompt(activityData, formatInstructions) {
  return `You are an expert GitHub repository analyst. Your task is to analyze the activity of the repository "${activityData.repositoryInfo.name}" over the last ${activityData.timePeriod} and provide a comprehensive summary.

Repository Information:
- Name: ${activityData.repositoryInfo.name}
- Description: ${activityData.repositoryInfo.description || 'No description provided'}
- Stars: ${activityData.repositoryInfo.stars}
- Forks: ${activityData.repositoryInfo.forks}
- URL: ${activityData.repositoryInfo.url}

Please analyze the following data and provide a structured summary according to the format instructions below. Focus on:
1. Key trends and patterns in issues and PRs
2. Notable contributions and contributors
3. Potential areas of concern or improvement
4. Overall repository health and activity level

${formatInstructions}

Remember to:
- Be concise but informative
- Highlight significant changes or patterns
- Identify potential bottlenecks or areas needing attention
- Provide actionable recommendations
- Include relevant statistics and metrics`;
}

/**
 * Creates a human prompt for the LLM
 * @param {Object} activityData - The GitHub activity data
 * @returns {string} - The human prompt
 */
function createHumanPrompt(activityData) {
  const issuesSummary = activityData.issues.length > 0
    ? `\nIssues (${activityData.issues.length}):
${activityData.issues.map(issue => `- #${issue.number}: ${issue.title} (${issue.state})`).join('\n')}`
    : '\nNo issues found.';

  const prsSummary = activityData.pullRequests.length > 0
    ? `\nPull Requests (${activityData.pullRequests.length}):
${activityData.pullRequests.map(pr => `- #${pr.number}: ${pr.title} (${pr.state})`).join('\n')}`
    : '\nNo pull requests found.';

  return `Please analyze this GitHub repository activity data and provide a structured summary:

${issuesSummary}
${prsSummary}

Please provide your analysis in the specified format.`;
}

/**
 * Formats the parsed summary for display
 * @param {Object} summary - The parsed summary object
 * @returns {string} - The formatted summary
 */
function formatSummary(summary) {
  return `
📊 Repository Activity Summary
============================

${summary.overview}

📝 Issues Summary
----------------
Total Issues: ${summary.issues.total}
- Open: ${summary.issues.open}
- Closed: ${summary.issues.closed}

${summary.issues.summary}

Notable Issues:
${summary.issues.notableIssues.map(issue => `- #${issue.number}: ${issue.title} (${issue.status})
  ${issue.description}`).join('\n')}

🔄 Pull Requests Summary
------------------------
Total PRs: ${summary.pullRequests.total}
- Open: ${summary.pullRequests.open}
- Merged: ${summary.pullRequests.merged}
- Closed: ${summary.pullRequests.closed}

${summary.pullRequests.summary}

Notable Pull Requests:
${summary.pullRequests.notablePRs.map(pr => `- #${pr.number}: ${pr.title} (${pr.status})
  ${pr.description}`).join('\n')}


💡 Recommendations
------------------
${summary.recommendations.map(rec => `- ${rec}`).join('\n')}`;
}

/**
 * Summarizes GitHub activity for a repository
 * @param {Object} options - The options object
 * @param {string} options.owner - Repository owner
 * @param {string} options.repo - Repository name
 * @param {number} options.days - Number of days to look back
 * @param {string} options.model - Ollama model to use
 * @returns {Promise<string>} - Promise resolving to the formatted summary
 */
export async function summarizeRepo({ 
  owner, 
  repo, 
  days = 7, 
  model = 'mistral'
}) {
  try {
    // Get repository info
    const spinner = ora('Fetching repository information...').start();
    const repoInfo = await fetchGitHubAPI(`https://api.github.com/repos/${owner}/${repo}`);
    spinner.succeed(`Repository information fetched: ${repoInfo.full_name}`);
    
    // Fetch issues and PRs in parallel
    const [issues, pullRequests] = await Promise.all([
      fetchRecentIssues({ owner, repo, days }),
      fetchRecentPullRequests({ owner, repo, days })
    ]);
    
    console.log(chalk.blue(`Found ${issues.length} issues and ${pullRequests.length} pull requests updated in the last ${days} days`));
    
    // Prepare data for summarization
    const activityData = {
      repositoryInfo: {
        name: repoInfo.full_name,
        description: repoInfo.description,
        stars: repoInfo.stargazers_count,
        forks: repoInfo.forks_count,
        url: repoInfo.html_url
      },
      timePeriod: `${days} days`,
      issues: issues.map(issue => ({
        number: issue.number,
        title: issue.title,
        state: issue.state,
        created_at: issue.created_at,
        updated_at: issue.updated_at,
        closed_at: issue.closed_at,
        author: issue.user?.login || 'unknown',
        labels: (issue.labels || []).map(label => typeof label === 'object' ? label.name : label),
        url: issue.html_url
      })),
      pullRequests: pullRequests.map(pr => ({
        number: pr.number,
        title: pr.title,
        state: pr.state,
        created_at: pr.created_at,
        updated_at: pr.updated_at,
        merged_at: pr.merged_at || null,
        closed_at: pr.closed_at,
        author: pr.user?.login || 'unknown',
        url: pr.html_url
      }))
    };
    
    // Initialize the Ollama model
    const llm = new ChatOllama({
      model: model,
      temperature: 0.7,
      maxTokens: 2000
    });

    const formatInstructions = `Please format your response as human readable output that matches the structure used here:` + formatSummary({
      overview: "Summary overview goes here",
      issues: {
        total: 0,
        open: 0,
        closed: 0,
        summary: "Issues summary goes here",
        notableIssues: [
          { number: 123, title: "Example issue", status: "open", description: "Issue description" }
        ]
      },
      pullRequests: {
        total: 0,
        open: 0,
        merged: 0,
        closed: 0,
        summary: "PRs summary goes here",
        notablePRs: [
          { number: 456, title: "Example PR", status: "merged", description: "PR description" }
        ]
      },
      recommendations: ["Example recommendation"]
    });

    // Create the messages
    const messages = [
      new SystemMessage(createSystemPrompt(activityData, formatInstructions)),
      new HumanMessage(createHumanPrompt(activityData))
    ];

    // Get the response from the LLM
    const summarySpinner = ora('Generating activity summary with Ollama...').start();
    const response = await llm.invoke(messages);
    summarySpinner.succeed('Activity summary generated successfully');
    return response.content;
  } catch (error) {
    console.error(chalk.red('Error summarizing GitHub activity:'), error.message);
    throw error;
  }
} 