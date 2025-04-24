const axios = require("axios");
const fs = require("fs");
const path = require("path");

const GITHUB_API_BASE = "https://api.github.com";
const USERNAME = "e-labInnovations";
const OUTPUT_FILE = path.join(process.cwd(), "github-stats.json");

async function fetchUserData() {
  try {
    const response = await axios.get(`${GITHUB_API_BASE}/users/${USERNAME}`, {
      headers: {
        Authorization: `token ${process.env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    const userData = response.data;
    return {
      hireable: userData.hireable,
      createdAt: new Date(userData.created_at).getTime(),
      collaborators: userData.collaborators || 0,
      diskUsage: userData.disk_usage || 0,
      followers: userData.followers,
      following: userData.following,
      id: userData.id,
      ownedPrivateRepos: userData.owned_private_repos || 0,
      privateGists: userData.private_gists || 0,
      publicGists: userData.public_gists,
      publicRepos: userData.public_repos,
      totalPrivateRepos: userData.total_private_repos || 0,
      avatarUrl: userData.avatar_url,
      blog: userData.blog,
      company: userData.company,
      email: userData.email,
      gravatarId: userData.gravatar_id || "",
      htmlUrl: userData.html_url,
      location: userData.location,
      login: userData.login,
      name: userData.name,
      type: userData.type,
      url: userData.url,
      plan: userData.plan || null,
    };
  } catch (error) {
    console.error("Error fetching user data:", error.message);
    throw error;
  }
}

async function fetchRepositories() {
  try {
    const response = await axios.get(
      `${GITHUB_API_BASE}/users/${USERNAME}/repos`,
      {
        headers: {
          Authorization: `token ${process.env.GITHUB_TOKEN}`,
          Accept: "application/vnd.github.v3+json",
        },
        params: {
          per_page: 100,
          sort: "updated",
          direction: "desc",
        },
      }
    );

    const repoStarCount = {};
    const repoStarCountDescriptions = {};
    const repoCommitCount = {};
    const repoCommitCountDescriptions = {};
    const langRepoCount = {};
    const langStarCount = {};
    const langCommitCount = {};
    const repoForks = {};
    const repoWatchers = {};
    const repoTopics = {};
    const repoSizes = {};

    for (const repo of response.data) {
      // Basic repo stats
      repoStarCount[repo.name] = repo.stargazers_count;
      repoStarCountDescriptions[repo.name] = repo.description;
      repoForks[repo.name] = repo.forks_count;
      repoWatchers[repo.name] = repo.watchers_count;
      repoSizes[repo.name] = repo.size;

      // Get commit count
      const commitsResponse = await axios.get(
        `${GITHUB_API_BASE}/repos/${USERNAME}/${repo.name}/commits`,
        {
          headers: {
            Authorization: `token ${process.env.GITHUB_TOKEN}`,
            Accept: "application/vnd.github.v3+json",
          },
          params: {
            per_page: 1,
          },
        }
      );
      repoCommitCount[repo.name] = commitsResponse.data.length;
      repoCommitCountDescriptions[repo.name] = repo.description;

      // Get topics
      const topicsResponse = await axios.get(
        `${GITHUB_API_BASE}/repos/${USERNAME}/${repo.name}/topics`,
        {
          headers: {
            Authorization: `token ${process.env.GITHUB_TOKEN}`,
            Accept: "application/vnd.github.v3+json",
          },
        }
      );
      repoTopics[repo.name] = topicsResponse.data.names || [];

      // Get language stats
      const languagesResponse = await axios.get(
        `${GITHUB_API_BASE}/repos/${USERNAME}/${repo.name}/languages`,
        {
          headers: {
            Authorization: `token ${process.env.GITHUB_TOKEN}`,
            Accept: "application/vnd.github.v3+json",
          },
        }
      );

      for (const [lang, bytes] of Object.entries(languagesResponse.data)) {
        langRepoCount[lang] = (langRepoCount[lang] || 0) + 1;
        langStarCount[lang] =
          (langStarCount[lang] || 0) + repo.stargazers_count;
        langCommitCount[lang] =
          (langCommitCount[lang] || 0) + commitsResponse.data.length;
      }
    }

    return {
      repoStarCount,
      repoStarCountDescriptions,
      repoCommitCount,
      repoCommitCountDescriptions,
      langRepoCount,
      langStarCount,
      langCommitCount,
      repoForks,
      repoWatchers,
      repoTopics,
      repoSizes,
    };
  } catch (error) {
    console.error("Error fetching repositories:", error.message);
    throw error;
  }
}

async function fetchActivityMetrics() {
  try {
    const response = await axios.get(
      `${GITHUB_API_BASE}/users/${USERNAME}/events`,
      {
        headers: {
          Authorization: `token ${process.env.GITHUB_TOKEN}`,
          Accept: "application/vnd.github.v3+json",
        },
        params: {
          per_page: 100,
        },
      }
    );

    const events = response.data;
    const activityMetrics = {
      totalPullRequests: 0,
      mergedPullRequests: 0,
      totalIssues: 0,
      closedIssues: 0,
      contributionStreak: 0,
      mostActiveRepos: {},
      recentActivity: [],
    };

    let currentStreak = 0;
    let lastDate = null;

    for (const event of events) {
      const date = new Date(event.created_at).toISOString().split("T")[0];

      // Track contribution streak
      if (lastDate && date !== lastDate) {
        currentStreak = 0;
      }
      currentStreak++;
      activityMetrics.contributionStreak = Math.max(
        activityMetrics.contributionStreak,
        currentStreak
      );
      lastDate = date;

      // Count different event types
      if (event.type === "PullRequestEvent") {
        activityMetrics.totalPullRequests++;
        if (event.payload.pull_request.merged) {
          activityMetrics.mergedPullRequests++;
        }
      } else if (event.type === "IssuesEvent") {
        activityMetrics.totalIssues++;
        if (event.payload.action === "closed") {
          activityMetrics.closedIssues++;
        }
      }

      // Track most active repos
      if (event.repo) {
        const repoName = event.repo.name.split("/")[1];
        activityMetrics.mostActiveRepos[repoName] =
          (activityMetrics.mostActiveRepos[repoName] || 0) + 1;
      }

      // Track recent activity
      activityMetrics.recentActivity.push({
        type: event.type,
        repo: event.repo?.name,
        date: event.created_at,
        action: event.payload?.action,
      });
    }

    // Sort and limit most active repos
    activityMetrics.mostActiveRepos = Object.entries(
      activityMetrics.mostActiveRepos
    )
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});

    return activityMetrics;
  } catch (error) {
    console.error("Error fetching activity metrics:", error.message);
    return {};
  }
}

async function fetchCollaborationStats() {
  try {
    const response = await axios.get(
      `${GITHUB_API_BASE}/users/${USERNAME}/events`,
      {
        headers: {
          Authorization: `token ${process.env.GITHUB_TOKEN}`,
          Accept: "application/vnd.github.v3+json",
        },
        params: {
          per_page: 100,
        },
      }
    );

    const collaborationStats = {
      organizationsContributed: new Set(),
      externalReposContributed: new Set(),
      topCollaborators: {},
      pullRequestReviews: 0,
    };

    for (const event of response.data) {
      if (event.org) {
        collaborationStats.organizationsContributed.add(event.org.login);
      }

      if (event.repo && !event.repo.name.startsWith(`${USERNAME}/`)) {
        collaborationStats.externalReposContributed.add(event.repo.name);
      }

      if (event.type === "PullRequestReviewEvent") {
        collaborationStats.pullRequestReviews++;
      }

      if (event.actor && event.actor.login !== USERNAME) {
        collaborationStats.topCollaborators[event.actor.login] =
          (collaborationStats.topCollaborators[event.actor.login] || 0) + 1;
      }
    }

    // Convert sets to counts
    collaborationStats.organizationsContributed =
      collaborationStats.organizationsContributed.size;
    collaborationStats.externalReposContributed =
      collaborationStats.externalReposContributed.size;

    // Sort and limit top collaborators
    collaborationStats.topCollaborators = Object.entries(
      collaborationStats.topCollaborators
    )
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});

    return collaborationStats;
  } catch (error) {
    console.error("Error fetching collaboration stats:", error.message);
    return {};
  }
}

async function fetchQuarterCommitCount() {
  try {
    const response = await axios.get(
      `${GITHUB_API_BASE}/users/${USERNAME}/events`,
      {
        headers: {
          Authorization: `token ${process.env.GITHUB_TOKEN}`,
          Accept: "application/vnd.github.v3+json",
        },
        params: {
          per_page: 100,
        },
      }
    );

    const quarterCommitCount = {};
    const events = response.data.filter((event) => event.type === "PushEvent");

    for (const event of events) {
      const date = new Date(event.created_at);
      const quarter = `${date.getFullYear()}-Q${
        Math.floor(date.getMonth() / 3) + 1
      }`;
      quarterCommitCount[quarter] = (quarterCommitCount[quarter] || 0) + 1;
    }

    return quarterCommitCount;
  } catch (error) {
    console.error("Error fetching quarter commit count:", error.message);
    return {};
  }
}

async function generateStats() {
  try {
    const [
      userData,
      repoData,
      quarterCommitCount,
      activityMetrics,
      collaborationStats,
    ] = await Promise.all([
      fetchUserData(),
      fetchRepositories(),
      fetchQuarterCommitCount(),
      fetchActivityMetrics(),
      fetchCollaborationStats(),
    ]);

    const stats = {
      user: userData,
      quarterCommitCount,
      ...repoData,
      activityMetrics,
      collaborationStats,
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(stats, null, 2));
    console.log("GitHub stats generated successfully!");
  } catch (error) {
    console.error("Failed to generate GitHub stats:", error.message);
    process.exit(1);
  }
}

// Run the script
generateStats();
