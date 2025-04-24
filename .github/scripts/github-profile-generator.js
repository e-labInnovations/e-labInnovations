// github-profile-generator.js
import { Octokit } from "@octokit/rest";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

// Configuration
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || ""; // Set your GitHub token as an environment variable
const USERNAME = process.argv[2]; // Get username from command line argument

if (!USERNAME) {
  console.error("Please provide a GitHub username as an argument");
  console.error("Example: node github-profile-generator.js e-labInnovations");
  process.exit(1);
}

if (!GITHUB_TOKEN) {
  console.error("Please set GITHUB_TOKEN environment variable");
  console.error("Example: export GITHUB_TOKEN=your_token_here");
  process.exit(1);
}

// Initialize Octokit with authentication
const octokit = new Octokit({
  auth: GITHUB_TOKEN,
});

// Add delay between requests to avoid rate limiting
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Generate quarter labels from user creation date until now
 */
function getCommitsForQuarters(user, repoCommits) {
  const creation = new Date(user.created_at);
  const startYear = creation.getFullYear();
  const startQuarter = Math.floor(creation.getMonth() / 3) + 1;

  const now = new Date();
  const endYear = now.getFullYear();
  const endQuarter = Math.floor(now.getMonth() / 3) + 1;

  // Create all quarter buckets from creation date to now
  const quarterBuckets = {};

  for (let year = startYear; year <= endYear; year++) {
    const startQ = year === startYear ? startQuarter : 1;
    const endQ = year === endYear ? endQuarter : 4;

    for (let quarter = startQ; quarter <= endQ; quarter++) {
      quarterBuckets[`${year}-Q${quarter}`] = 0;
    }
  }

  // Count commits per quarter
  const flattenedCommits = Object.values(repoCommits).flat();

  flattenedCommits.forEach((commit) => {
    const date = new Date(commit.commit.committer.date);
    const year = date.getFullYear();
    const quarter = Math.floor(date.getMonth() / 3) + 1;
    const yearQuarter = `${year}-Q${quarter}`;

    if (quarterBuckets[yearQuarter] !== undefined) {
      quarterBuckets[yearQuarter]++;
    }
  });

  // Sort the quarters chronologically
  return Object.fromEntries(
    Object.entries(quarterBuckets).sort((a, b) => {
      const [yearA, quarterA] = a[0].split("-Q");
      const [yearB, quarterB] = b[0].split("-Q");
      return yearA - yearB || quarterA - quarterB;
    })
  );
}

/**
 * Get all repositories for a user
 */
async function getRepositories(username) {
  let page = 1;
  let allRepos = [];
  let hasMore = true;

  while (hasMore) {
    try {
      const { data: repos } = await octokit.repos.listForUser({
        username,
        per_page: 100,
        page: page++,
      });

      allRepos = [...allRepos, ...repos];
      hasMore = repos.length === 100;

      // Add delay between requests
      await delay(1000);
    } catch (error) {
      if (error.status === 403) {
        const resetTime = new Date(error.headers["x-ratelimit-reset"] * 1000);
        const waitTime = resetTime - new Date();
        console.log(
          `Rate limit exceeded. Waiting ${Math.ceil(
            waitTime / 1000
          )} seconds...`
        );
        await delay(waitTime);
        continue;
      }
      throw error;
    }
  }

  return allRepos.filter((repo) => !repo.fork && repo.size !== 0);
}

/**
 * Get commits for a repository
 */
async function getCommitsForRepo(repo, username) {
  try {
    let page = 1;
    let allCommits = [];
    let hasMore = true;

    while (hasMore) {
      try {
        const { data: commits } = await octokit.repos.listCommits({
          owner: repo.owner.login,
          repo: repo.name,
          author: username,
          per_page: 100,
          page: page++,
        });

        allCommits = [...allCommits, ...commits];
        hasMore = commits.length === 100;

        // GitHub API has limits, so we'll stop after 500 commits per repo
        if (allCommits.length >= 500) break;

        // Add delay between requests
        await delay(1000);
      } catch (error) {
        if (error.status === 403) {
          const resetTime = new Date(error.headers["x-ratelimit-reset"] * 1000);
          const waitTime = resetTime - new Date();
          console.log(
            `Rate limit exceeded. Waiting ${Math.ceil(
              waitTime / 1000
            )} seconds...`
          );
          await delay(waitTime);
          continue;
        }
        throw error;
      }
    }

    return allCommits;
  } catch (e) {
    console.error(`Failed to get commits for ${repo.name}: ${e.message}`);
    return [];
  }
}

/**
 * Generate GitHub user profile
 */
async function generateUserProfile(username) {
  try {
    console.log(`Generating profile for ${username}...`);

    // Get user info
    const { data: user } = await octokit.users.getByUsername({ username });
    console.log(`User found: ${user.name || user.login}`);

    // Get repositories
    console.log("Fetching repositories...");
    const repos = await getRepositories(username);
    console.log(`Found ${repos.length} non-fork repositories`);

    // Get commits for each repo
    console.log(
      "Fetching commits for each repository (this may take a while)..."
    );
    const repoCommits = {};
    for (const repo of repos) {
      console.log(`Processing ${repo.name}...`);
      const commits = await getCommitsForRepo(repo, username);
      repoCommits[repo.name] = commits.filter(
        (commit) =>
          commit.author &&
          commit.author.login.toLowerCase() === username.toLowerCase()
      );
    }

    console.log("Calculating statistics...");

    // Group repos by language
    const reposByLang = {};
    repos.forEach((repo) => {
      const lang = repo.language || "Unknown";
      if (!reposByLang[lang]) {
        reposByLang[lang] = [];
      }
      reposByLang[lang].push(repo);
    });

    // Calculate metrics
    const quarterCommitCount = getCommitsForQuarters(user, repoCommits);

    // Language repo count
    const langRepoCount = {};
    Object.keys(reposByLang).forEach((lang) => {
      langRepoCount[lang] = reposByLang[lang].length;
    });

    // Sort by count in descending order
    const sortedLangRepoCount = Object.fromEntries(
      Object.entries(langRepoCount).sort((a, b) => b[1] - a[1])
    );

    // Language star count
    const langStarCount = {};
    Object.entries(reposByLang).forEach(([lang, langRepos]) => {
      langStarCount[lang] = langRepos.reduce(
        (acc, repo) => acc + repo.stargazers_count,
        0
      );
    });

    // Filter languages with stars and sort by count
    const filteredLangStarCount = Object.fromEntries(
      Object.entries(langStarCount)
        .filter(([_, count]) => count > 0)
        .sort((a, b) => b[1] - a[1])
    );

    // Language commit count
    const langCommitCount = {};
    Object.entries(reposByLang).forEach(([lang, langRepos]) => {
      langCommitCount[lang] = langRepos.reduce((acc, repo) => {
        return acc + (repoCommits[repo.name]?.length || 0);
      }, 0);
    });

    const sortedLangCommitCount = Object.fromEntries(
      Object.entries(langCommitCount).sort((a, b) => b[1] - a[1])
    );

    // Repo commit count (top 10)
    const repoCommitCountMap = {};
    repos.forEach((repo) => {
      repoCommitCountMap[repo.name] = repoCommits[repo.name]?.length || 0;
    });

    const sortedRepoCommitCount = Object.fromEntries(
      Object.entries(repoCommitCountMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
    );

    // Repo star count (top 10)
    const repoStarCount = Object.fromEntries(
      repos
        .filter((repo) => repo.stargazers_count > 0)
        .map((repo) => [repo.name, repo.stargazers_count])
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
    );

    // Repo descriptions
    const repoCommitCountDescriptions = {};
    Object.keys(sortedRepoCommitCount).forEach((repoName) => {
      const repo = repos.find((r) => r.name === repoName);
      repoCommitCountDescriptions[repoName] = repo?.description || null;
    });

    const repoStarCountDescriptions = {};
    Object.keys(repoStarCount).forEach((repoName) => {
      const repo = repos.find((r) => r.name === repoName);
      repoStarCountDescriptions[repoName] = repo?.description || null;
    });

    // Create user profile object
    const userProfile = {
      user: {
        hireable: user.hireable,
        createdAt: new Date(user.created_at).getTime(),
        collaborators: user.collaborators || 0,
        diskUsage: user.disk_usage || 0,
        followers: user.followers,
        following: user.following,
        id: user.id,
        ownedPrivateRepos: user.owned_private_repos || 0,
        privateGists: user.private_gists || 0,
        publicGists: user.public_gists,
        publicRepos: user.public_repos,
        totalPrivateRepos: user.total_private_repos || 0,
        avatarUrl: user.avatar_url,
        blog: user.blog,
        company: user.company,
        email: user.email,
        gravatarId: user.gravatar_id || "",
        htmlUrl: user.html_url,
        location: user.location,
        login: user.login,
        name: user.name,
        type: user.type,
        url: user.url,
        plan: user.plan,
      },
      quarterCommitCount,
      langRepoCount: sortedLangRepoCount,
      langStarCount: filteredLangStarCount,
      langCommitCount: sortedLangCommitCount,
      repoCommitCount: sortedRepoCommitCount,
      repoStarCount,
      repoCommitCountDescriptions,
      repoStarCountDescriptions,
    };

    return userProfile;
  } catch (error) {
    console.error("Error generating profile:", error);
    process.exit(1);
  }
}

// Main execution
(async () => {
  try {
    console.log("Starting GitHub profile generation...");

    const userProfile = await generateUserProfile(USERNAME);

    // Write to file
    const outputFile = `${USERNAME}-profile.json`;
    fs.writeFileSync(outputFile, JSON.stringify(userProfile, null, 2));

    console.log(`Profile successfully generated and saved to ${outputFile}`);
  } catch (error) {
    console.error("Error:", error);
  }
})();
