"use strict";

console.log("LOADING LIBRARIES...");

require("dotenv").config({path: "./kenku.env"});

const fs = require("fs");
const {
	Client,
	GatewayIntentBits,
	MessageType,
	ChannelType,
	EmbedBuilder,
	Collection,
	ActivityType,
	SlashCommandBuilder,
	SlashCommandChannelOption,
	REST,
	Routes,
	Events,
	PermissionsBitField
} = require("discord.js");

const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent,
		GatewayIntentBits.GuildWebhooks
]});

client.login(process.env.DISCORD_TOKEN).catch(console.error);

async function registerSlashCommands() {
	const rest = new REST().setToken(process.env.DISCORD_TOKEN);
	const commands = [
		new SlashCommandBuilder()
			.setName("help")
			.setDescription("Shows help for using this bot.").toJSON(),
		new SlashCommandBuilder()
			.setName("copy")
			.setDescription("Copies all messages from another channel.")
			.addChannelOption(option =>
				option.setName("from")
					.setDescription("The channel to copy messages from.")
					.addChannelTypes(
						ChannelType.GuildText,
						ChannelType.PublicThread,
						ChannelType.PrivateThread
					))
			.addChannelOption(option =>
				option.setName("to")
					.setDescription("The channel to paste messages to.")
					.addChannelTypes(
						ChannelType.GuildText,
						ChannelType.PublicThread,
						ChannelType.PrivateThread
					)).toJSON(),
		new SlashCommandBuilder()
			.setName("stop")
			.setDescription("Stops copying messages.").toJSON()
	];
	await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {body: commands});
}


client.on("ready", function() {
	// registerSlashCommands();
	client.user.setActivity({name: "D&D with Avrae", type: ActivityType.Playing});
	console.log("READY FOR ACTION!");
});

const activeChannels = {};

function capitalizeFirst(str) {
	return str.charAt(0).toUpperCase() + str.slice(1);
}

async function send(webhook, channel, content, reactions) {
	if (webhook && channel.isThread()) {
		if (typeof content === 'string') {
			content = {content: content, threadId: channel.id};
		} else {
			content.threadId = channel.id;
		}
	}
	content.allowedMentions = {parse: []};
	const sent = await (webhook || channel).send(content).catch(console.error);
	if (reactions.size) {
		for (const reaction of reactions.values()) {
			const emoji = reaction.emoji;
			if (client.emojis.cache.has(emoji.id) || emoji.id === null) {
				await sent.react(emoji).catch(console.error);
			}
		}
	}
}

const systemMessages = {
	[MessageType.AutoModerationAction]: "did an AutoModerationAction.",
	[MessageType.Call]: "started a call.",
	[MessageType.ChannelFollowAdd]: "did a ChannelFollowAdd.",
	[MessageType.ChannelIconChange]: "changed the icon of this channel.",
	[MessageType.ChannelNameChange]: "changed the name of this channel.",
	[MessageType.ChannelPinnedMessage]: "pinned a message to this channel.",
	[MessageType.ChatInputCommand]: "did a ChatInputCommand.",
	[MessageType.ContextMenuCommand]: "did a ContextMenuCommand.",
	[MessageType.GuildApplicationPremiumSubscription]: "did a GuildApplicationPremiumSubscription.",
	[MessageType.GuildBoost]: "did a GuildBoost.",
	[MessageType.GuildBoostTier1]: "did a GuildBoostTier1.",
	[MessageType.GuildBoostTier2]: "did a GuildBoostTier2.",
	[MessageType.GuildBoostTier3]: "did a GuildBoostTier3.",
	[MessageType.GuildDiscoveryDisqualified]: "did a GuildDiscoveryDisqualified.",
	[MessageType.GuildDiscoveryGracePeriodFinalWarning]: "did a GuildDiscoveryGracePeriodFinalWarning.",
	[MessageType.GuildDiscoveryGracePeriodInitialWarning]: "did a GuildDiscoveryGracePeriodInitialWarning.",
	[MessageType.GuildDiscoveryRequalified]: "did a GuildDiscoveryRequalified.",
	[MessageType.GuildInviteReminder]: "did a GuildInviteReminder.",
	[MessageType.InteractionPremiumUpsell]: "did a InteractionPremiumUpsell.",
	[MessageType.RecipientAdd]: "added someone to the group.",
	[MessageType.RecipientRemove]: "removed someone from the group.",
	[MessageType.RoleSubscriptionPurchase]: "did a RoleSubscriptionPurchase.",
	[MessageType.StageEnd]: "did a StageEnd.",
	[MessageType.StageRaiseHand]: "did a StageRaiseHand.",
	[MessageType.StageSpeaker]: "did a StageSpeaker.",
	[MessageType.StageStart]: "did a StageStart.",
	[MessageType.StageTopic]: "did a StageTopic.",
	[MessageType.ThreadCreated]: "created a Thread.",
	[MessageType.UserJoin]: "just joined.",
};

const normalMessages = [
	MessageType.Default,
	MessageType.Reply
];

async function sendMessage(message, channel, webhook, author) {
	if (systemMessages[message.type] !== undefined) {
		await channel.send(
			`**${message.author.username} ${systemMessages[message.type]}**`
		).catch(console.error);
		return;
	} else if (message.type === MessageType.ThreadStarterMessage) {
		const starterMessage = await message.channel.fetchStarterMessage();
		await sendMessage(starterMessage, channel, webhook, author);
	} else if (normalMessages.indexOf(message.type) === -1) {
		console.log(`Unknown message type encountered: ${message.type}`);
		await channel.send(
			`**${message.author.username} sent an unknown type of message (${message.type})**`
		).catch(console.error);
		return;
	}
	if (message.author.username !== author) {
		if (webhook) {
			await webhook.edit({
				name: message.author.username,
				avatar: message.author.displayAvatarURL()
			}).catch(console.error);
		} else {
			await channel.send(`**${message.author.username}**`).catch(console.error);
		}
	}
	const out = {};
	const bigFiles = [];
	let notEmpty = false;
	if (message.content) {
		out.content = message.content
		notEmpty = true;
	}
	if (message.attachments.size) {
		console.log(message.attachments);
		out.files = [];
		for (const attachment of message.attachments.values()) {
			if (attachment.filesize > 8000000) {
				bigFiles.push(attachment.url);
			} else {
				out.files.push(attachment.url);
				notEmpty = true;
			}
		}
	}
	if (message.embeds.length) {
		out.embeds = [];
		for (const embed of message.embeds) {
			if (embed.data.type === "rich") {
				out.embeds.push(embed);
				notEmpty = true;
			} else {
				console.log(`Weird embed type: ${embed.data.type}\nMsg: ${message.url}`);
			}
		}
	}
	if (notEmpty) {
		await send(webhook, channel, out, message.reactions);
	}
	for (const bigFile of bigFiles) {
		await send(webhook, channel, bigFile, message.reactions);
	}
}

async function sendMessages(messages, from, to, webhook, author) {
	let last;
	if (messages && messages.size) {
		for (const message of [...messages.values()].reverse()) {
			if (activeChannels[to.id] !== from.id) return false;
			await sendMessage(message, to, webhook, last ? last.author.username : author);
			last = message;
		}
	}
	return true;
}

async function fetchMessages(from, to, webhook, interaction) {
	let messages = new Collection();
	let messageBatch = await from.messages.fetch({limit: 100}).catch(async function() {
		await interaction.reply({content: "Failed to fetch messages!", ephemeral: true});
	});
	while (messageBatch && messageBatch.size > 0) {
		if (activeChannels[to.id] !== from.id) return false;
		to.sendTyping();
		messages = messages.concat(messageBatch);
		messageBatch = await from.messages.fetch({
			limit: 100,
			before: messageBatch.last().id,
		}).catch(async function() {
			await interaction.reply({content: "Failed to fetch messages!", ephemeral: true});
		});
	}
	return await sendMessages(messages, from, to, webhook, null);
}

async function fetchWebhook(channel, interaction) {
	const webhookChannel = channel.isThread() ? channel.parent : channel
	const webhooks = await webhookChannel.fetchWebhooks().catch(async function() {
		await interaction.reply({content: "Failed to read webhooks!", ephemeral: true});
	});
	if (webhooks) {
		for (const webhook of webhooks.values()) {
			if (webhook.owner.id === client.user.id) {
				return webhook;
			}
		}
	}
	return webhookChannel.createWebhook({
		name: "Kenku Beak",
		avatar: client.user.displayAvatarURL(),
		reason: "Reposting"
	}).catch(console.error);
}

const validChannelTypes = [
	ChannelType.GuildText,
	ChannelType.PublicThread,
	ChannelType.PrivateThread
];

async function repost(from, to, interaction) {
	if (from.id === to.id) {
		await interaction.reply({content: "I can't paste in the same channel I'm copying from!", ephemeral: true});
	} else if (validChannelTypes.indexOf(to.type) === -1) {
		await interaction.reply({content: "I can only copy from text-based server channels!", ephemeral: true});
	} else if (validChannelTypes.indexOf(to.type) === -1) {
		await interaction.reply({content: "I can only paste in text-based server channels!", ephemeral: true});
	} else if (!to.permissionsFor(client.user).has(PermissionsBitField.Flags.SendMessages)) {
		await interaction.reply({content: `I haven't got permission to post in <#${to.id}>!`, ephemeral: true});
	} else if (activeChannels[to.id] !== undefined) {
		await interaction.reply({content: `I'm already pasting into <#${to.id}> from <#${activeChannels[to.id]}>!`, ephemeral: true});
	} else {
		await interaction.reply({content: `Okay, I'll copy messages from <#${from.id}> to <#${to.id}>...`, ephemeral: true});
		activeChannels[to.id] = from.id;
		const hook = await fetchWebhook(to, interaction);
		if (await fetchMessages(from, to, hook, interaction)) {
			await interaction.followUp({content: "I've finished copying!", ephemeral: true});
		} else {
			await interaction.followUp({content: "I've aborted copying!", ephemeral: true});
		}
		delete activeChannels[to.id];
	}
}

client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isChatInputCommand()) return;

	switch (interaction.commandName) {
		case "help":
			await interaction.reply({content: "I can help you!", ephemeral: true});
			break;
		case "copy":
			let from = interaction.options.getChannel("from") || interaction.channel;
			let to = interaction.options.getChannel("to") || interaction.channel;
			await repost(from, to, interaction);
			break;
		case "stop":
			delete activeChannels[interaction.channel.id];
			await interaction.reply({content: "Okay, I'll stop copying!", ephemeral: true});
			break;
		default:
			console.error(`No command matching ${interaction.commandName} was found.`);
			return;
	}
});
