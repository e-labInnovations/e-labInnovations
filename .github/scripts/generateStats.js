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
      followers: userData.followers,
      following: userData.following,
      publicRepos: userData.public_repos,
      publicGists: userData.public_gists,
      login: userData.login,
      name: userData.name,
      avatarUrl: userData.avatar_url,
      blog: userData.blog,
      location: userData.location,
      htmlUrl: userData.html_url,
      url: userData.url,
      type: userData.type,
      id: userData.id,
      company: userData.company,
      email: userData.email,
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
    response.data.forEach((repo) => {
      repoStarCount[repo.name] = repo.stargazers_count;
    });

    return repoStarCount;
  } catch (error) {
    console.error("Error fetching repositories:", error.message);
    throw error;
  }
}

async function generateStats() {
  try {
    const [userData, repoStarCount] = await Promise.all([
      fetchUserData(),
      fetchRepositories(),
    ]);

    const stats = {
      user: userData,
      repoStarCount,
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
